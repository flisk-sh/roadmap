#!/usr/bin/env ruby
# frozen_string_literal: true

# Fetches live signals for every tool with a `repo`: stars, archived flag, last push and the
# latest release date. Writes _data/github.json, which the site shows next to the hand-written
# data, and _data/skill_repos.json with the stars of every repo a skill comes from.
# CI runs this before each build and once a week, so the numbers stay fresh.
#   GITHUB_TOKEN=... ruby scripts/fetch-github.rb
# Needs Ruby 2.6 or newer and nothing else. Without a token, GitHub allows 60 calls an hour,
# which is not enough; the script then stops and keeps the old file.
require "json"
require "net/http"
require "time"
require "yaml"

ROOT = File.expand_path("..", __dir__)
OUT = File.join(ROOT, "_data/github.json")
TOKEN = ENV["GITHUB_TOKEN"].to_s

def get(path, hops = 0)
  uri = URI(path.start_with?("http") ? path : "https://api.github.com#{path}")
  req = Net::HTTP::Get.new(uri)
  req["Accept"] = "application/vnd.github+json"
  req["User-Agent"] = "flisk-roadmap"
  req["Authorization"] = "Bearer #{TOKEN}" unless TOKEN.empty?
  res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 20) { |h| h.request(req) }
  # A renamed or moved repo answers 301 with its new address.
  return get(res["location"], hops + 1) if [301, 302, 307].include?(res.code.to_i) && res["location"] && hops < 3
  return [res.code.to_i, nil] unless res.code.to_i == 200
  [200, JSON.parse(res.body)]
end

if TOKEN.empty?
  warn "GITHUB_TOKEN is not set; keeping #{File.basename(OUT)} as it is."
  exit 0
end

tools = Dir[File.join(ROOT, "_data/tools/*.yml")].flat_map { |f| YAML.load_file(f) }
out = {}
failed = 0
tools.each do |t|
  next unless t["repo"]
  code, repo = get("/repos/#{t['repo']}")
  if code != 200
    failed += 1
    warn "#{t['id']}: #{t['repo']} answered #{code}"
    next
  end
  _, rel = get("/repos/#{t['repo']}/releases/latest")
  out[t["id"]] = {
    "stars" => repo["stargazers_count"],
    "archived" => repo["archived"],
    "pushed" => repo["pushed_at"],
    "release" => rel && rel["published_at"],
    "version" => rel && rel["tag_name"]
  }
end

out = { "fetched" => Time.now.utc.iso8601, "tools" => out }
File.write(OUT, JSON.pretty_generate(out) + "\n")
puts "#{out['tools'].size} tool repos fetched, #{failed} failed"

sources = Dir[File.join(ROOT, "_data/skills/*.yml")].flat_map { |f| YAML.load_file(f) || [] }.map { |s| s["source"] }.compact.uniq
repos = {}
sources.each do |src|
  code, repo = get("/repos/#{src}")
  next warn("skill source #{src}: #{code}") unless code == 200
  repos[src] = { "stars" => repo["stargazers_count"], "archived" => repo["archived"], "pushed" => repo["pushed_at"] }
end
File.write(File.join(ROOT, "_data/skill_repos.json"), JSON.pretty_generate({ "fetched" => Time.now.utc.iso8601, "repos" => repos }) + "\n")
puts "#{repos.size} skill repos fetched"
