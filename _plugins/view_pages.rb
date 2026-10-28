# frozen_string_literal: true

# One page per view and sub-tab, built from _data/meta.yml and the list each view takes its
# sub-tabs from, so every sub-tab has a real URL that can be shared: /compass/, /compass/agents/,
# /journeys/backend/, /roles/run/ and so on. The first view is also the home page.
# Plugins only run when Jekyll builds the site itself, which is what the GitHub Actions
# workflow does. GitHub's built-in Pages build does not run them.
module Roadmap
  # Where each kind of sub-tab comes from. Kept in one place so the pages, the layout and
  # assets/data.json agree.
  def self.subtab_list(site, kind)
    case kind
    when "families" then site.data["families"] || []
    when "tracks" then site.data.dig("journeys", "tracks") || []
    when "roles" then site.data.dig("roles", "groups") || []
    when "skills" then site.data["skill_categories"] || []
    else []
    end
  end

  class ViewPage < Jekyll::PageWithoutAFile
    def initialize(site, dir, view, sub)
      @site = site
      @base = site.source
      @dir = dir
      @name = "index.html"
      process(@name)
      self.data = { "layout" => "view", "view" => view["id"], "sub" => sub }
      self.content = ""
    end
  end

  # Merges _data/skills/*.yml into one list and attaches each skill's eval result and the
  # GitHub signals of its source repo, so pages and data.json read one shape.
  class SkillData < Jekyll::Generator
    safe true
    priority :high

    def generate(site)
      files = site.data["skills"] || {}
      evals = site.data.dig("skill_evals", "skills") || {}
      repos = site.data.dig("skill_repos", "repos") || {}
      list = files.keys.sort.flat_map { |k| files[k] || [] }.map do |s|
        s = s.dup
        s["result"] = evals[s["id"]] if evals[s["id"]]
        s["repo_info"] = repos[s["source"]] if repos[s["source"]]
        s
      end
      site.data["skill_list"] = list
    end
  end

  class ViewPages < Jekyll::Generator
    safe true
    priority :low

    def generate(site)
      views = site.data.dig("meta", "views") || []
      views.each_with_index do |view, index|
        site.pages << ViewPage.new(site, "", view, nil) if index.zero?
        # Every view has a page of its own at /<view>/; Journeys shows its first track there.
        subs = [nil] + Roadmap.subtab_list(site, view["subtabs"]).map { |s| s["id"] }
        subs.each do |sub|
          dir = sub ? "#{view['id']}/#{sub}" : view["id"]
          site.pages << ViewPage.new(site, dir, view, sub)
        end
      end
    end
  end
end
