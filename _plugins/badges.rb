# frozen_string_literal: true

# One award badge per tool, at /badges/<id>.svg, from the tool's Adoption Radar ring.
# Tool makers embed the URL, so the badge always shows the ring the data gives today:
# move a tool to another ring and its badge changes on the next build.
# Hold is not an award, so Hold tools get no badge.
module Roadmap
  module Badges
    RINGS = {
      "adopt" => { "label" => "ADOPT", "line" => "Use it", "from" => "#16a34a", "to" => "#4ade80" },
      "trial" => { "label" => "TRIAL", "line" => "Worth a try", "from" => "#0284c7", "to" => "#7dd3fc" },
      "assess" => { "label" => "ASSESS", "line" => "One to watch", "from" => "#d97706", "to" => "#fcd34d" }
    }.freeze

    def self.season(time)
      m = time.month
      name = if [12, 1, 2].include?(m) then "WINTER"
             elsif m <= 5 then "SPRING"
             elsif m <= 8 then "SUMMER"
             else "FALL"
             end
      "#{name} #{time.year}"
    end

    def self.xml(s)
      s.to_s.gsub("&", "&amp;").gsub("<", "&lt;").gsub(">", "&gt;").gsub('"', "&quot;")
    end

    # Long names shrink so they stay inside the shield.
    def self.name_size(name)
      [17, (240.0 / [name.length, 1].max).floor].min.clamp(9, 17)
    end

    # Very long names are squeezed to the shield's inner width instead of spilling out.
    def self.name_fit(name)
      size = name_size(name)
      name.length * size * 0.6 > 124 ? %( textLength="124" lengthAdjust="spacingAndGlyphs") : ""
    end

    def self.svg(tool, family, season)
      r = RINGS[tool["ring"]]
      id = xml(tool["id"])
      name = xml(tool["name"])
      fam = xml(family ? family["name"] : "")
      <<~SVG
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="184" viewBox="0 0 160 184" role="img" aria-label="#{name}: #{r['label'].capitalize} on the DevEx Roadmap, #{season.downcase}">
          <title>#{name}: #{r['label'].capitalize} on the DevEx Roadmap (#{season.downcase})</title>
          <defs>
            <linearGradient id="g-#{id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#{r['from']}"/><stop offset="1" stop-color="#{r['to']}"/></linearGradient>
            <linearGradient id="s-#{id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1c26"/><stop offset="1" stop-color="#08080c"/></linearGradient>
          </defs>
          <path d="M80 4 L152 24 V98 C152 142 120 168 80 180 C40 168 8 142 8 98 V24 Z" fill="url(#s-#{id})" stroke="url(#g-#{id})" stroke-width="5" stroke-linejoin="round"/>
          <g font-family="Helvetica, Arial, sans-serif" text-anchor="middle">
            <text x="80" y="40" fill="#ececf1" fill-opacity="0.75" font-size="9.5" font-weight="700" letter-spacing="1.6">DEVEX ROADMAP</text>
            <circle cx="80" cy="52" r="3" fill="url(#g-#{id})"/>
            <path d="M0 64 H160 L150 82 L160 100 H0 L10 82 Z" fill="url(#g-#{id})"/>
            <text x="80" y="90" fill="#04120a" font-size="22" font-weight="900" letter-spacing="1.5">#{r['label']}</text>
            <text x="80" y="124" fill="#ffffff" font-size="#{name_size(tool['name'])}" font-weight="700"#{name_fit(tool['name'])}>#{name}</text>
            <text x="80" y="140" fill="#ececf1" fill-opacity="0.6" font-size="8.5">#{fam}</text>
            <text x="80" y="160" fill="url(#g-#{id})" font-size="9" font-weight="700" letter-spacing="1.4">#{season}</text>
          </g>
        </svg>
      SVG
    end

    def self.tools(site)
      (site.data["families"] || []).flat_map do |f|
        (site.data.dig("tools", f["id"]) || []).map { |t| [t, f] }
      end.select { |t, _| RINGS.key?(t["ring"]) }
    end
  end

  class BadgeFile < Jekyll::PageWithoutAFile
    def initialize(site, tool, family, season)
      @site = site
      @base = site.source
      @dir = "badges"
      @name = "#{tool['id']}.svg"
      process(@name)
      self.data = { "layout" => nil, "sitemap" => false }
      self.content = Badges.svg(tool, family, season)
    end
  end

  class BadgeFiles < Jekyll::Generator
    safe true
    priority :low

    def generate(site)
      season = Badges.season(site.time)
      site.config["badge_season"] = season
      Badges.tools(site).each do |tool, family|
        site.pages << BadgeFile.new(site, tool, family, season)
      end
    end
  end
end
