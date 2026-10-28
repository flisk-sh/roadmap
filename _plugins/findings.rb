# frozen_string_literal: true

# Builds site.data["findings"] for /findings/: short, shareable lists computed from the data.
# Some are truth checks: where the live GitHub numbers disagree with a hand-written ring.
module Roadmap
  class Findings < Jekyll::Generator
    safe true
    priority :normal

    STALE_DAYS = 548 # 18 months, the Hold rule

    def generate(site)
      gh = site.data.dig("github", "tools") || {}
      fams = (site.data["families"] || []).map { |f| [f["id"], f] }.to_h
      tools = (site.data["tools"] || {}).flat_map do |fid, list|
        (list || []).map do |t|
          t.merge("fam" => fid, "fam_name" => fams.dig(fid, "name"), "x" => Array(t["dx"]).size * 10,
                  "y" => Array(t["parity"]).size * 10, "gh" => gh[t["id"]])
        end
      end
      now = Time.now
      age = ->(iso) { iso ? ((now - Time.parse(iso)) / 86_400).round : nil }

      archived = tools.select { |t| t.dig("gh", "archived") && t["ring"] != "hold" }
      stale = tools.select do |t|
        g = t["gh"] || {}
        last = g["release"] || g["pushed"]
        t["ring"] != "hold" && !g["archived"] && last && age.(last) > STALE_DAYS
      end
      skills = (site.data["skill_list"] || []).select { |s| s["result"] }

      site.data["findings"] = {
        "total" => tools.size,
        "archived_not_hold" => archived.sort_by { |t| -(t.dig("gh", "stars") || 0) },
        "stale_not_hold" => stale.map { |t| t.merge("days" => age.(t.dig("gh", "release") || t.dig("gh", "pushed"))) }.sort_by { |t| -t["days"] },
        "hold" => tools.select { |t| t["ring"] == "hold" }.sort_by { |t| -(t.dig("gh", "stars") || 0) },
        "best_of_both" => tools.select { |t| t["x"] >= 60 && t["y"] >= 60 }.sort_by { |t| -(t["x"] + t["y"]) },
        "easy_wins" => tools.select { |t| t["x"] >= 80 && t["y"] <= 30 }.sort_by { |t| -t["x"] }.first(12),
        "most_starred" => tools.select { |t| t["gh"] }.sort_by { |t| -t.dig("gh", "stars") }.first(12),
        "fresh" => tools.select { |t| t["ring"] == "assess" },
        "skills_best" => skills.sort_by { |s| [-s.dig("result", "score"), s["name"]] }.first(12),
        "skills_worst" => skills.sort_by { |s| [s.dig("result", "score"), s["name"]] }.first(8),
        "skills_tested" => skills.size
      }
    end
  end
end
