#!/usr/bin/env ruby
# frozen_string_literal: true

# Tests every agent skill in _data/skills/*.yml with a small, cheap model, and writes the
# results to _data/skill_evals.json. Two tests per skill:
#
#   Picked right   Haiku is a coding agent with one repo's skills installed (their real names
#                  and descriptions, read from SKILL.md on GitHub). It gets each skill's two
#                  "should" requests and its one "near" request, mixed with the other skills'
#                  requests, and picks a skill or "none" for each. 1 point per request routed
#                  right; for "near", right means it did not pick this skill.
#   Followed right Haiku gets the whole SKILL.md and the first "should" request and says its
#                  first action. A second, batched Haiku call checks that action against the
#                  skill's own first step.
#
# Score: (picked + 2 x followed) out of 5, shown out of 100.
# The test questions were written from each skill's text by a stronger model; Haiku only
# takes the test. Uses `claude -p` (your Claude login or ANTHROPIC_API_KEY), tools disabled.
#
#   ruby scripts/eval-skills.rb                     all skills, results file rewritten
#   ruby scripts/eval-skills.rb --limit 5           smoke test on 5 skills, writes nothing
#   ruby scripts/eval-skills.rb --only gstack-ship  one skill, merged into the results file
#   ruby scripts/eval-skills.rb --jobs 8            parallel calls (default 6)
require "json"
require "net/http"
require "open3"
require "time"
require "timeout"
require "yaml"

ROOT = File.expand_path("..", __dir__)
OUT = File.join(ROOT, "_data/skill_evals.json")
MODEL = ENV.fetch("EVAL_MODEL", "haiku")
args = ARGV.dup
opt = ->(name) { i = args.index(name); i ? args[i + 1] : nil }
LIMIT = opt.("--limit")&.to_i
ONLY = opt.("--only")
JOBS = (opt.("--jobs") || 6).to_i
CHUNK = 40

$cost = 0.0
$calls = 0
$model_id = nil
$lock = Mutex.new

def claude(system, prompt)
  2.times do
    out, _err, st = Timeout.timeout(180) do
      Open3.capture3("claude", "-p", "--model", MODEL, "--output-format", "json", "--tools", "",
                     "--system-prompt", system, "--no-session-persistence", stdin_data: prompt)
    end
    next unless st.success?
    j = JSON.parse(out) rescue next
    $lock.synchronize do
      $cost += j["total_cost_usd"].to_f
      $calls += 1
      $model_id ||= (j["modelUsage"] || {}).keys.first
    end
    return j["result"].to_s
  rescue Timeout::Error
    next
  end
  nil
end

def json_from(text)
  return nil unless text
  body = text[/\{.*\}/m]
  body && JSON.parse(body)
rescue JSON::ParserError
  nil
end

def fetch_skill(source, path)
  uri = URI("https://raw.githubusercontent.com/#{source}/HEAD/#{path}")
  res = Net::HTTP.get_response(uri)
  res.is_a?(Net::HTTPSuccess) ? res.body.force_encoding("UTF-8") : nil
rescue StandardError
  nil
end

def frontmatter(md)
  block = md.to_s[/\A---\s*\n(.*?)\n---/m, 1]
  (block && YAML.safe_load(block)) || {}
rescue StandardError
  {}
end

def pool(items, jobs)
  q = Queue.new
  items.each { |i| q << i }
  Array.new(jobs) do
    Thread.new do
      loop do
        item = begin
          q.pop(true)
        rescue ThreadError
          break
        end
        yield item
      end
    end
  end.each(&:join)
end

skills = Dir[File.join(ROOT, "_data/skills/*.yml")].sort.flat_map { |f| YAML.load_file(f) || [] }
skills = skills.select { |s| s["id"] == ONLY } if ONLY
skills = skills.first(LIMIT) if LIMIT
abort "no skills to test" if skills.empty?
puts "Testing #{skills.size} skills with #{MODEL}, #{JOBS} at a time"

# 1. Read every SKILL.md from GitHub.
pool(skills, 12) do |s|
  md = fetch_skill(s["source"], s["path"])
  fm = frontmatter(md)
  s["_md"] = md
  s["_desc"] = (fm["description"] || s["what"]).to_s.gsub(/\s+/, " ").strip[0, 600]
end
missing = skills.count { |s| s["_md"].nil? }
puts "Read #{skills.size - missing} SKILL.md files (#{missing} could not be fetched)"

results = Hash.new { |h, k| h[k] = { "routes" => [] } }

# 2. Picked right: route each repo's requests against that repo's installed skills.
route_jobs = []
skills.group_by { |s| s["source"] }.each do |source, list|
  # The catalog is the whole repo, even when only some of its skills are being tested.
  catalog = ONLY || LIMIT ? list : list
  reqs = list.flat_map do |s|
    e = s["eval"] || {}
    Array(e["should"]).map { |p| { "skill" => s["id"], "prompt" => p, "expect" => "this" } } +
      (e["near"] ? [{ "skill" => s["id"], "prompt" => e["near"], "expect" => "not" }] : [])
  end
  reqs = reqs.sort_by { |r| r["prompt"].hash } # mix them, the same way every run
  reqs.each_slice(CHUNK) { |chunk| route_jobs << [source, catalog, chunk] }
end

system_route = "You are a coding agent deciding which of your installed skills to load for a user's request. " \
               "Load a skill only when it clearly fits. Reply with JSON only."
pool(route_jobs, JOBS) do |(source, catalog, chunk)|
  list = catalog.map { |s| "- #{s['id']}: #{s['_desc']}" }.join("\n")
  reqs = chunk.each_with_index.map { |r, i| "#{i + 1}. #{r['prompt']}" }.join("\n")
  prompt = "Installed skills (from #{source}):\n#{list}\n\nFor each request, pick the ONE skill id you would load, " \
           "or \"none\" if no skill fits. Reply with a JSON object mapping each request number to a skill id or \"none\".\n\n" \
           "Requests:\n#{reqs}"
  picks = json_from(claude(system_route, prompt)) || {}
  chunk.each_with_index do |r, i|
    got = picks[(i + 1).to_s].to_s.strip
    ok = r["expect"] == "this" ? got == r["skill"] : got != r["skill"]
    $lock.synchronize do
      results[r["skill"]]["routes"] << { "prompt" => r["prompt"], "expect" => r["expect"], "got" => got.empty? ? nil : got, "ok" => ok }
    end
  end
end
puts "Picked right: #{route_jobs.size} calls"

# 3. Followed right: Haiku reads the skill and names its first action.
system_follow = "You are a coding agent. You have loaded the skill below and you follow it exactly."
pool(skills.select { |s| s["_md"] }, JOBS) do |s|
  req = Array(s.dig("eval", "should")).first
  prompt = "<skill>\n#{s['_md'][0, 14_000]}\n</skill>\n\nUser request: #{req}\n\n" \
           "In one sentence, what is the first concrete action you take? Reply with only that sentence."
  ans = claude(system_follow, prompt).to_s.strip.lines.first.to_s.strip
  $lock.synchronize { results[s["id"]]["follow"] = { "answer" => ans[0, 240], "ok" => false } }
end
puts "Followed right: answers collected"

# 4. Grade those answers in batches.
system_grade = "You grade whether an agent's first action matches a skill's first step. Reply with JSON only."
graded = skills.select { |s| results[s["id"]]["follow"] && !results[s["id"]]["follow"]["answer"].empty? }
pool(graded.each_slice(15).to_a, JOBS) do |batch|
  items = batch.each_with_index.map do |s, i|
    "#{i + 1}. Expected first step: #{s.dig('eval', 'first_step')}\n   Agent's first action: #{results[s['id']]['follow']['answer']}"
  end.join("\n")
  prompt = "For each item, is the agent's first action the same step as the expected one, in substance? " \
           "Wording can differ; the kind of action must match. Reply with a JSON object mapping each item number to true or false.\n\n#{items}"
  marks = json_from(claude(system_grade, prompt)) || {}
  batch.each_with_index do |s, i|
    v = marks[(i + 1).to_s]
    $lock.synchronize { results[s["id"]]["follow"]["ok"] = v == true || v.to_s == "true" }
  end
end

# 5. Scores.
out = {}
skills.each do |s|
  r = results[s["id"]]
  routes = r["routes"]
  picked = routes.count { |x| x["ok"] }
  followed = r.dig("follow", "ok") ? 1 : 0
  out[s["id"]] = {
    "score" => ((picked + 2 * followed) * 100.0 / (routes.size + 2)).round,
    "picked" => picked, "picked_of" => routes.size,
    "followed" => followed, "followed_of" => 1,
    "routes" => routes, "follow" => r["follow"]
  }
end

printf("%d calls, $%.2f\n", $calls, $cost)
if LIMIT
  puts JSON.pretty_generate(out)
  puts "(smoke test: nothing written)"
  exit 0
end

prev = File.exist?(OUT) ? JSON.parse(File.read(OUT)) : {}
merged = ONLY ? (prev["skills"] || {}).merge(out) : out
File.write(OUT, JSON.pretty_generate({
  "model" => $model_id || MODEL,
  "ran" => Time.now.utc.iso8601,
  "calls" => $calls,
  "cost_usd" => $cost.round(2),
  "skills" => merged
}) + "\n")
avg = merged.values.sum { |v| v["score"] } / [merged.size, 1].max
puts "Wrote #{OUT}: #{merged.size} skills, average score #{avg}"
