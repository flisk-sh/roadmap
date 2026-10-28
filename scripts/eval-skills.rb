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
#                  first step in the test. An answer that fails gets one appeal: Haiku reads the
#                  skill itself and decides whether the action is what THIS skill says to do first.
#                  The test's first step was written by another model and can miss things (a
#                  required preamble command, say), so the skill text has the last word.
#
# Score: (picked + 2 x followed) out of 5, shown out of 100.
# Every test runs RUNS times (default 3) with the requests in a different order each time, and
# each answer counts by majority vote, so one unlucky reply cannot move a score by 20 points.
# The results keep the votes ("2 of 3 runs") so the site can show how sure each answer is.
# The test questions were written from each skill's text by a stronger model; Haiku only
# takes the test. Uses `claude -p` (your Claude login or ANTHROPIC_API_KEY), tools disabled.
#
#   ruby scripts/eval-skills.rb                     all skills, results file rewritten
#   ruby scripts/eval-skills.rb --limit 5           smoke test on 5 skills, writes nothing
#   ruby scripts/eval-skills.rb --only gstack-ship  one skill, merged into the results file
#   ruby scripts/eval-skills.rb --source flisk-sh/flisk-skills,flisk-sh/flisk   only these repos, merged
#   ruby scripts/eval-skills.rb --jobs 8            parallel calls (default 6)
#   ruby scripts/eval-skills.rb --runs 1            one run, no vote (cheaper, noisier; default 3)
#   ruby scripts/eval-skills.rb --regrade           only rerun the appeal on failed follows in the results file
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
SOURCES = opt.("--source")&.split(",")
REGRADE = args.include?("--regrade")
JOBS = (opt.("--jobs") || 6).to_i
RUNS = [(opt.("--runs") || 3).to_i, 1].max
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

# The appeal: the skill text decides, not the test's one-line summary of it.
SYSTEM_APPEAL = "You check whether a coding agent followed a skill. Judge only by the skill text. Reply with JSON only."
def appeal(skill, req, answer)
  prompt = "<skill>\n#{skill['_md'].to_s[0, 9000]}\n</skill>\n\nUser request: #{req}\n" \
           "Agent's first action: #{answer}\n" \
           "A reviewer expected this first step: #{skill.dig('eval', 'first_step')}\n\n" \
           "The reviewer may have missed something the skill requires first, such as a setup or preamble command. " \
           "Is the agent's first action what THIS skill tells it to do first for this request? " \
           "Reply as {\"ok\": true or false, \"why\": \"one short sentence\"}."
  json_from(claude(SYSTEM_APPEAL, prompt)) || {}
end

def appeal_all(skills, results)
  failed = skills.select { |s| s["_md"] && results[s["id"]]["follow"] && !results[s["id"]]["follow"]["ok"] && !results[s["id"]]["follow"]["answer"].to_s.empty? }
  pool(failed, JOBS) do |s|
    f = results[s["id"]]["follow"]
    v = appeal(s, Array(s.dig("eval", "should")).first, f["answer"])
    $lock.synchronize do
      f["appealed"] = true
      f["ok"] = v["ok"] == true
      f["why"] = v["why"].to_s[0, 200] unless v["why"].to_s.empty?
    end
  end
  failed.size
end

def score_of(r)
  routes = r["routes"] || []
  picked = routes.count { |x| x["ok"] }
  followed = r.dig("follow", "ok") ? 1 : 0
  { "score" => ((picked + 2 * followed) * 100.0 / (routes.size + 2)).round, "picked" => picked, "picked_of" => routes.size,
    "followed" => followed, "followed_of" => 1 }
end

skills = Dir[File.join(ROOT, "_data/skills/*.yml")].sort.flat_map { |f| YAML.load_file(f) || [] }
skills = skills.select { |s| s["id"] == ONLY } if ONLY
skills = skills.select { |s| SOURCES.include?(s["source"]) } if SOURCES
skills = skills.first(LIMIT) if LIMIT
abort "no skills to test" if skills.empty?

if REGRADE
  prev = JSON.parse(File.read(OUT))
  results = prev["skills"]
  todo = skills.select { |s| results[s["id"]] && !results[s["id"]].dig("follow", "ok") && !results[s["id"]].dig("follow", "appealed") }
  pool(todo, 12) { |s| s["_md"] = fetch_skill(s["source"], s["path"]) }
  n = appeal_all(todo, results)
  results.each_value { |r| r.merge!(score_of(r)) }
  prev["skills"] = results
  prev["calls"] = prev["calls"].to_i + $calls
  prev["cost_usd"] = (prev["cost_usd"].to_f + $cost).round(2)
  prev["appealed"] = Time.now.utc.iso8601
  File.write(OUT, JSON.pretty_generate(prev) + "\n")
  won = todo.count { |s| results[s["id"]].dig("follow", "ok") }
  printf("Appealed %d failed follows, %d upheld by the skill text; %d calls, $%.2f\n", n, won, $calls, $cost)
  exit 0
end
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

SYSTEM_ROUTE = "You are a coding agent deciding which of your installed skills to load for a user's request. " \
               "Load a skill only when it clearly fits. Reply with JSON only."
SYSTEM_FOLLOW = "You are a coding agent. You have loaded the skill below and you follow it exactly."
SYSTEM_GRADE = "You grade whether an agent's first action matches a skill's first step. Reply with JSON only."

# One full pass of both tests. Returns { skill id => { "routes" => [...], "follow" => {...} } }.
def one_run(skills, run)
  results = Hash.new { |h, k| h[k] = { "routes" => [] } }

  # Picked right: route each repo's requests against that repo's installed skills, in an order
  # that differs per run.
  rng = Random.new(1000 + run)
  route_jobs = []
  skills.group_by { |s| s["source"] }.each do |source, list|
    reqs = list.flat_map do |s|
      e = s["eval"] || {}
      Array(e["should"]).map { |p| { "skill" => s["id"], "prompt" => p, "expect" => "this" } } +
        (e["near"] ? [{ "skill" => s["id"], "prompt" => e["near"], "expect" => "not" }] : [])
    end
    reqs.shuffle(random: rng).each_slice(CHUNK) { |chunk| route_jobs << [source, list.shuffle(random: rng), chunk] }
  end
  pool(route_jobs, JOBS) do |(source, catalog, chunk)|
    list = catalog.map { |s| "- #{s['id']}: #{s['_desc']}" }.join("\n")
    reqs = chunk.each_with_index.map { |r, i| "#{i + 1}. #{r['prompt']}" }.join("\n")
    prompt = "Installed skills (from #{source}):\n#{list}\n\nFor each request, pick the ONE skill id you would load, " \
             "or \"none\" if no skill fits. Reply with a JSON object mapping each request number to a skill id or \"none\".\n\n" \
             "Requests:\n#{reqs}"
    picks = json_from(claude(SYSTEM_ROUTE, prompt)) || {}
    chunk.each_with_index do |r, i|
      got = picks[(i + 1).to_s].to_s.strip
      ok = r["expect"] == "this" ? got == r["skill"] : got != r["skill"]
      $lock.synchronize do
        results[r["skill"]]["routes"] << { "prompt" => r["prompt"], "expect" => r["expect"], "got" => got.empty? ? nil : got, "ok" => ok }
      end
    end
  end

  # Followed right: Haiku reads the skill and names its first action.
  pool(skills.select { |s| s["_md"] }, JOBS) do |s|
    req = Array(s.dig("eval", "should")).first
    prompt = "<skill>\n#{s['_md'][0, 14_000]}\n</skill>\n\nUser request: #{req}\n\n" \
             "In one sentence, what is the first concrete action you take? Reply with only that sentence."
    ans = claude(SYSTEM_FOLLOW, prompt).to_s.strip.lines.first.to_s.strip
    $lock.synchronize { results[s["id"]]["follow"] = { "answer" => ans[0, 240], "ok" => false } }
  end

  # Grade those answers in batches.
  graded = skills.select { |s| results[s["id"]]["follow"] && !results[s["id"]]["follow"]["answer"].empty? }
  pool(graded.each_slice(15).to_a, JOBS) do |batch|
    items = batch.each_with_index.map do |s, i|
      "#{i + 1}. Expected first step: #{s.dig('eval', 'first_step')}\n   Agent's first action: #{results[s['id']]['follow']['answer']}"
    end.join("\n")
    prompt = "For each item, is the agent's first action the same step as the expected one, in substance? " \
             "Wording can differ; the kind of action must match. Reply with a JSON object mapping each item number to true or false.\n\n#{items}"
    marks = json_from(claude(SYSTEM_GRADE, prompt)) || {}
    batch.each_with_index do |s, i|
      v = marks[(i + 1).to_s]
      $lock.synchronize { results[s["id"]]["follow"]["ok"] = v == true || v.to_s == "true" }
    end
  end

  # Appeal failed follows against the skill text.
  appeal_all(skills, results)
  results
end

# Majority vote across runs, per request and per follow. Ties go to "not right": a skill has to
# win most runs to get the point.
def vote(skills, runs)
  out = {}
  skills.each do |s|
    id = s["id"]
    by_prompt = Hash.new { |h, k| h[k] = [] }
    runs.each { |r| r[id]["routes"].each { |x| by_prompt[[x["prompt"], x["expect"]]] << x } }
    routes = by_prompt.map do |(prompt, expect), xs|
      yes = xs.count { |x| x["ok"] }
      ok = yes * 2 > runs.size
      side = xs.select { |x| x["ok"] == ok }
      got = side.map { |x| x["got"] }.group_by(&:itself).max_by { |_, v| v.size }&.first
      { "prompt" => prompt, "expect" => expect, "got" => got, "ok" => ok, "votes" => "#{yes}/#{runs.size}" }
    end
    follows = runs.map { |r| r[id]["follow"] }.compact
    fyes = follows.count { |f| f["ok"] }
    fok = fyes * 2 > runs.size
    pick = follows.find { |f| f["ok"] == fok } || follows.first || {}
    follow = pick.merge("ok" => fok, "votes" => "#{fyes}/#{runs.size}")
    out[id] = { "routes" => routes, "follow" => follow }
  end
  out
end

runs = Array.new(RUNS) do |k|
  r = one_run(skills, k)
  printf("Run %d of %d done: %d calls so far, $%.2f\n", k + 1, RUNS, $calls, $cost)
  r
end
voted = vote(skills, runs)
out = {}
skills.each { |s| r = voted[s["id"]]; out[s["id"]] = score_of(r).merge("routes" => r["routes"], "follow" => r["follow"]) }

printf("%d calls, $%.2f\n", $calls, $cost)
if LIMIT
  puts JSON.pretty_generate(out)
  puts "(smoke test: nothing written)"
  exit 0
end

prev = File.exist?(OUT) ? JSON.parse(File.read(OUT)) : {}
merged = ONLY || SOURCES ? (prev["skills"] || {}).merge(out) : out
partial = ONLY || SOURCES
File.write(OUT, JSON.pretty_generate(prev.merge(
  "model" => $model_id || prev["model"] || MODEL,
  "ran" => partial ? prev["ran"] || Time.now.utc.iso8601 : Time.now.utc.iso8601,
  "calls" => (partial ? prev["calls"].to_i : 0) + $calls,
  "cost_usd" => ((partial ? prev["cost_usd"].to_f : 0) + $cost).round(2),
  "runs" => RUNS,
  "skills" => merged
)) + "\n")
avg = merged.values.sum { |v| v["score"] } / [merged.size, 1].max
puts "Wrote #{OUT}: #{merged.size} skills, average score #{avg}"
