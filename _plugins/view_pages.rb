# frozen_string_literal: true

# One page per view and sub-tab, built from _data/meta.yml, families.yml and journeys.yml,
# so every sub-tab has a real URL that can be shared: /compass/, /compass/agents/,
# /journeys/backend/ and so on. The first view is also the home page.
# Plugins only run when Jekyll builds the site itself, which is what the GitHub Actions
# workflow does. GitHub's built-in Pages build does not run them.
module Roadmap
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

  class ViewPages < Jekyll::Generator
    safe true
    priority :low

    def generate(site)
      views = site.data.dig("meta", "views") || []
      families = site.data["families"] || []
      tracks = site.data.dig("journeys", "tracks") || []

      views.each_with_index do |view, index|
        site.pages << ViewPage.new(site, "", view, nil) if index.zero?
        # Every view has a page of its own at /<view>/; Journeys shows its first track there.
        subs = [nil] + (view["subtabs"] == "tracks" ? tracks : families).map { |s| s["id"] }
        subs.each do |sub|
          dir = sub ? "#{view['id']}/#{sub}" : view["id"]
          site.pages << ViewPage.new(site, dir, view, sub)
        end
      end
    end
  end
end
