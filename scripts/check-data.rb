#!/usr/bin/env ruby
# frozen_string_literal: true

# Checks the data in _data/ before the site is built. Needs Ruby 2.6 or newer and nothing else.
#   ruby scripts/check-data.rb          structure, ids, symbols, criteria, journey references
#   ruby scripts/check-data.rb --stats  also print counts per family and ring
require "yaml"

ROOT = File.expand_path("..", __dir__)
def load(path)
  YAML.load_file(File.join(ROOT, path))
end

families = load("_data/families.yml")
rubric = load("_data/rubric.yml")
journeys = load("_data/journeys.yml")

errors = []
dx_ids = rubric["dx"]["criteria"].map { |c| c["id"] }
parity_ids = rubric["parity"]["criteria"].map { |c| c["id"] }
rings = rubric["rings"].map { |r| r["id"] }
licenses = rubric["licenses"].keys
ids = {}
syms = {}
counts = Hash.new { |h, k| h[k] = Hash.new(0) }

families.each do |fam|
  path = "_data/tools/#{fam['id']}.yml"
  unless File.exist?(File.join(ROOT, path))
    errors << "#{path}: missing"
    next
  end
  tools = load(path)
  errors << "#{path}: must be a list" unless tools.is_a?(Array)
  Array(tools).each_with_index do |t, i|
    at = "#{path}[#{i}] #{t['id'] || '?'}"
    %w[id name sym cat tagline url license ring evidence].each do |k|
      errors << "#{at}: missing #{k}" if t[k].to_s.strip.empty?
    end
    errors << "#{at}: id must be kebab-case" unless t["id"].to_s.match?(/\A[a-z0-9]+(-[a-z0-9]+)*\z/)
    errors << "#{at}: duplicate id (also in #{ids[t['id']]})" if ids[t["id"]]
    ids[t["id"]] = path
    errors << "#{at}: sym must be a capital and one or two lowercase letters or digits, like Fl or Cln" unless t["sym"].to_s.match?(/\A[A-Z][a-z0-9]{1,2}\z/)
    errors << "#{at}: sym #{t['sym']} already used by #{syms[t['sym']]}" if syms[t["sym"]]
    syms[t["sym"]] = t["id"]
    errors << "#{at}: cat '#{t['cat']}' is not one of #{fam['cats'].join(', ')}" unless fam["cats"].include?(t["cat"])
    errors << "#{at}: tagline over 60 characters" if t["tagline"].to_s.length > 60
    errors << "#{at}: note over 120 characters" if t["note"].to_s.length > 120
    %w[url evidence].each do |k|
      errors << "#{at}: #{k} must start with https://" unless t[k].to_s.start_with?("https://")
    end
    errors << "#{at}: repo must look like owner/name" if t["repo"] && !t["repo"].match?(%r{\A[\w.-]+/[\w.-]+\z})
    errors << "#{at}: license must be one of #{licenses.join(', ')}" unless licenses.include?(t["license"])
    errors << "#{at}: ring must be one of #{rings.join(', ')}" unless rings.include?(t["ring"])
    Array(t["dx"]).each { |c| errors << "#{at}: unknown dx criterion #{c}" unless dx_ids.include?(c) }
    Array(t["parity"]).each { |c| errors << "#{at}: unknown parity criterion #{c}" unless parity_ids.include?(c) }
    counts[fam["id"]][t["ring"]] += 1
  end
end

level_ids = journeys["levels"].map { |l| l["id"] }
journeys["levels"].each do |l|
  st = l.dig("flisk", "status")
  errors << "journeys level #{l['id']}: flisk.status must be yes, partial or soon" unless %w[yes partial soon].include?(st)
end
journeys["tracks"].each do |tr|
  (tr["stops"] || {}).each do |lid, stop|
    errors << "journeys #{tr['id']}: unknown level #{lid}" unless level_ids.include?(lid)
    (Array(stop["main"]) + Array(stop["side"])).each do |tid|
      errors << "journeys #{tr['id']}/#{lid}: unknown tool id #{tid}" unless ids[tid]
    end
  end
end

if ARGV.include?("--stats")
  total = counts.values.sum { |h| h.values.sum }
  puts "#{total} tools"
  counts.each { |fam, h| puts format("  %-14s %3d  %s", fam, h.values.sum, rings.map { |r| "#{r} #{h[r]}" }.join(", ")) }
end

if errors.empty?
  puts "OK: #{ids.size} tools, #{families.size} families, #{journeys['tracks'].size} journey tracks"
else
  puts errors
  puts "#{errors.size} problem(s)"
  exit 1
end
