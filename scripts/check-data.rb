#!/usr/bin/env ruby
# frozen_string_literal: true

# Checks the data in _data/ (tools.yml, tabs.yml, compare/<tab>.yml).
#
#   ruby scripts/check-data.rb                 structure: every tab has a cell per task and tool,
#                                              every cell has an https source, no TODO left
#   ruby scripts/check-data.rb --tab ID        only that tab (repeat the flag for more)
#   ruby scripts/check-data.rb --todo-ok       allow `TODO` placeholders (work in progress)
#   ruby scripts/check-data.rb --cli           also run each command of the primary tool (the first column)
#                                              against its installed CLI: the subcommands and flags
#                                              must show up in `<cli> ... --help`
#   ruby scripts/check-data.rb --links         also fetch every source URL and expect a 2xx
#
# Exit code 1 when anything fails.

require "yaml"
require "uri"
require "net/http"
require "open3"

DATA_DIR = ENV["DATA_DIR"] || File.expand_path("../_data", __dir__)
STATUSES = %w[match partial none na].freeze
NOTE_MAX = 110
BLURB_MAX = 100

check_cli = ARGV.include?("--cli")
check_links = ARGV.include?("--links")
todo_ok = ARGV.include?("--todo-ok")
only = ARGV.each_with_index.select { |a, _| a == "--tab" }.map { |_, i| ARGV[i + 1] }.compact

errors = []
warnings = []

tools = YAML.safe_load(File.read(File.join(DATA_DIR, "tools.yml")))
tabs = YAML.safe_load(File.read(File.join(DATA_DIR, "tabs.yml")))
meta = YAML.safe_load(File.read(File.join(DATA_DIR, "meta.yml")))

primary = meta["primary"].to_s
errors << "meta.yml: primary must name a tool in tools.yml (found #{primary.inspect})" unless tools.key?(primary)

tools.each do |id, t|
  %w[name tagline site docs].each do |k|
    errors << "tool #{id}: missing #{k}" if t[k].to_s.strip.empty?
  end
end

tab_ids = tabs.map { |t| t["id"] }
errors << "duplicate tab ids" unless tab_ids.uniq.size == tab_ids.size
unknown_only = only - tab_ids
errors << "--tab: unknown tab #{unknown_only.join(', ')}" unless unknown_only.empty?
selected = only.empty? ? tabs : tabs.select { |t| only.include?(t["id"]) }

def commands_of(cell)
  Array(cell["cmd"]).map(&:to_s)
end

todo_count = 0
cell_count = 0
task_count = 0
data_by_tab = {}

selected.each do |tab|
  tid = tab["id"]
  %w[id name title blurb tools].each do |k|
    errors << "tab #{tid}: missing #{k}" if tab[k].nil? || tab[k].to_s.strip.empty?
  end
  warnings << "tab #{tid}: blurb is #{tab['blurb'].to_s.size} chars, keep it under #{BLURB_MAX}" if tab["blurb"].to_s.size > BLURB_MAX

  tab_tools = tab["tools"] || []
  errors << "tab #{tid}: the primary tool (#{primary}) must be the first tool" unless tab_tools.first == primary
  errors << "tab #{tid}: duplicate tools" unless tab_tools.uniq.size == tab_tools.size
  (tab_tools - tools.keys).each { |t| errors << "tab #{tid}: tool #{t} is not in tools.yml" }

  path = File.join(DATA_DIR, "compare", "#{tid}.yml")
  unless File.exist?(path)
    errors << "tab #{tid}: missing #{path}"
    next
  end
  data = YAML.safe_load(File.read(path))
  data_by_tab[tid] = data
  tasks = data["tasks"] || []
  errors << "tab #{tid}: no tasks" if tasks.empty?
  ids = tasks.map { |t| t["id"] }
  errors << "tab #{tid}: duplicate task ids" unless ids.uniq.size == ids.size

  tasks.each do |task|
    task_count += 1
    where_task = "#{tid} / #{task['id']}"
    errors << "#{where_task}: missing task title" if task["task"].to_s.strip.empty?
    cells = task["cells"] || {}

    extra = cells.keys - tab_tools
    errors << "#{where_task}: cells for tools not in this tab: #{extra.join(', ')}" unless extra.empty?

    tab_tools.each do |tool|
      cell_count += 1
      cell = cells[tool]
      where = "#{where_task} / #{tool}"

      if cell.nil?
        errors << "#{where}: missing cell (use status: none for no equivalent)"
        next
      end
      if cell == "TODO"
        todo_count += 1
        errors << "#{where}: still TODO" unless todo_ok
        next
      end
      unless cell.is_a?(Hash)
        errors << "#{where}: cell must be a mapping"
        next
      end

      status = cell["status"] || "match"
      errors << "#{where}: bad status #{status.inspect}" unless STATUSES.include?(status)

      begin
        uri = URI.parse(cell["source"].to_s)
        errors << "#{where}: source must be an https URL" unless uri.is_a?(URI::HTTPS) && uri.host
      rescue URI::InvalidURIError
        errors << "#{where}: source is not a valid URL"
      end

      cmds = commands_of(cell)
      if %w[match partial].include?(status)
        errors << "#{where}: status #{status} needs a cmd" if cmds.empty?
      elsif !cmds.empty?
        errors << "#{where}: status #{status} must not have a cmd"
      end
      errors << "#{where}: cmd entries must be non-empty, trimmed strings" if cmds.any? { |c| c.strip.empty? || c != c.strip }
      errors << "#{where}: status partial needs a note saying why" if status == "partial" && cell["note"].to_s.strip.empty?
      warnings << "#{where}: note is #{cell['note'].to_s.size} chars, keep it under #{NOTE_MAX}" if cell["note"].to_s.size > NOTE_MAX
    end
  end
end

# --- The primary tool's commands against its installed CLI -----------------------
if check_cli
  bin = (meta["primary_cli"] || primary).to_s

  def run_cli(bin, *args)
    out, status = Open3.capture2e(bin, *args)
    [out.force_encoding(Encoding::UTF_8).scrub, status]
  rescue Errno::ENOENT
    [nil, nil]
  end

  version_out, = run_cli(bin, "--version")
  if version_out.nil?
    errors << "--cli: `#{bin}` is not on PATH"
  else
    installed = version_out.strip.split("\n").last.to_s.strip
    expected = meta.dig("checked", "version").to_s
    warnings << "installed #{bin} is #{installed}, data was checked against #{expected}" if !expected.empty? && installed != expected

    root_help, = run_cli(bin, "--help")
    help_cache = {}

    # Help text for `bin word word`, or nil when the last word is not a subcommand.
    # Some CLIs only answer `bin parent help child`, so that form is tried too. An unknown
    # word makes most CLIs print the root help, which is how it is told apart.
    sub_help = lambda do |words|
      help_cache.fetch(words) do
        out, st = run_cli(bin, *words, "--help")
        found = !out.nil? && st&.success? && out != root_help && out =~ /usage/i
        if !found && words.size >= 1
          out2, st2 = run_cli(bin, *words[0...-1], "help", words.last)
          if !out2.nil? && st2&.success? && out2 != root_help && out2 =~ /usage/i
            out = out2
            found = true
          end
        end
        found = true if !found && out.to_s =~ /could not run|not found in \$PATH/i
        help_cache[words] = found ? out : nil
      end
    end

    root_has_commands = root_help.to_s =~ /commands?:/i
    seen = {}

    data_by_tab.each do |tid, data|
      data["tasks"].each do |task|
        cell = task["cells"][primary]
        next unless cell.is_a?(Hash)

        commands_of(cell).each do |cmd|
          next if seen[cmd]

          seen[cmd] = true
          where = "#{tid} / #{task['id']} / #{primary}: `#{cmd}`"
          tokens = cmd.split
          first = tokens.shift
          # Commands run through a package runner (npx, bunx) belong to another program.
          next if %w[npx bunx pnpx].include?(first)

          unless first == bin
            errors << "#{where}: must start with #{bin}"
            next
          end

          path = []
          help = root_help
          while tokens.first && !tokens.first.start_with?("-")
            h = sub_help.call(path + [tokens.first])
            break if h.nil?

            path << tokens.shift
            help = h
          end

          if path.empty? && tokens.first && !tokens.first.start_with?("-") && root_has_commands
            errors << "#{where}: `#{bin} #{tokens.first}` is not a #{bin} command"
            next
          end

          if help.to_s =~ /could not run|not found in \$PATH/i
            warnings << "#{where}: help is not available here (#{help.strip.lines.first.strip}); flags not checked"
            next
          end

          tokens.select { |tok| tok.start_with?("-") }.map { |f| f.split("=").first }.each do |flag|
            errors << "#{where}: flag #{flag} not in `#{bin} #{path.join(' ')} --help`" unless help.to_s.include?(flag)
          end
        end
      end
    end
  end
end

# --- Source URLs ---------------------------------------------------------------
if check_links
  urls = []
  tools.each_value { |t| urls << t["site"] << t["docs"] }
  data_by_tab.each_value do |data|
    data["tasks"].each do |task|
      task["cells"].each_value { |c| urls << c["source"] if c.is_a?(Hash) }
    end
  end

  def fetch_status(url, limit = 5)
    uri = URI.parse(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 15
    http.read_timeout = 25
    req = Net::HTTP::Get.new(uri.request_uri, "User-Agent" => "command-comparer-link-check")
    res = http.request(req)
    if res.is_a?(Net::HTTPRedirection) && limit.positive?
      return fetch_status(URI.join(url, res["location"]).to_s, limit - 1)
    end

    res.code.to_i
  end

  urls.compact.map { |u| u.split("#").first }.uniq.each do |base|
    code = nil
    3.times do
      begin
        code = fetch_status(base)
      rescue StandardError => e
        code = e.class.name
      end
      break if code.is_a?(Integer) && code < 400

      sleep 2
    end
    if code.is_a?(Integer) && code < 400
      puts "ok   #{code} #{base}"
    else
      errors << "link: #{base} returned #{code}"
    end
  end
end

warnings.each { |w| warn "warning: #{w}" }

if errors.empty?
  msg = "OK: #{selected.size} tabs, #{task_count} tasks, #{cell_count} cells"
  msg += todo_ok ? " (#{todo_count} still TODO)." : ", every cell has a source."
  puts msg
else
  warn "#{errors.size} problem(s):"
  errors.first(60).each { |e| warn "  - #{e}" }
  warn "  ... and #{errors.size - 60} more" if errors.size > 60
  exit 1
end
