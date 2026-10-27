# frozen_string_literal: true

# One page per tab, built from _data/tabs.yml, so adding a tab needs no stub file.
# The first tab is the home page (/); the others live at /<id>/.
# Plugins only run when the site is built with Jekyll itself, which is what the
# GitHub Actions workflow does. GitHub's built-in Pages build does not run them.
module Comparer
  class TabPage < Jekyll::PageWithoutAFile
    def initialize(site, tab, home)
      @site = site
      @base = site.source
      @dir = home ? "" : tab["id"]
      @name = "index.html"
      process(@name)
      self.data = { "layout" => "tab", "tab" => tab["id"], "title" => tab["title"] }
      self.content = ""
    end
  end

  class TabPages < Jekyll::Generator
    safe true
    priority :low

    def generate(site)
      tabs = site.data["tabs"] || []
      tabs.each_with_index do |tab, index|
        site.pages << TabPage.new(site, tab, index.zero?)
      end
    end
  end
end
