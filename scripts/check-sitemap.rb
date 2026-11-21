require "fileutils"
require "jekyll"
require "rexml/document"
require "tmpdir"

root = File.expand_path("..", __dir__)
origin = "https://example.test"

Dir.mktmpdir("roadmap-sitemap-") do |tmp|
  source = File.join(tmp, "source")
  destination = File.join(tmp, "site")
  FileUtils.mkdir_p(File.join(source, "_notes"))
  FileUtils.cp(File.join(root, "sitemap.xml"), source)
  FileUtils.cp_r(File.join(root, "_includes"), source)

  {
    "older.md" => "permalink: /older/\nlast_modified_at: 2025-02-01",
    "newer.md" => "permalink: /newer/\nlast_modified_at: 2026-01-15",
    "undated.md" => "permalink: /undated/",
    "hidden.md" => "permalink: /hidden/\nsitemap: false",
    "_notes/dated.md" => "permalink: /notes/dated/\nlast_modified_at: 2024-10-02",
    "_notes/undated.md" => "permalink: /notes/undated/\nlast_modified_at: ''"
  }.each do |file, front_matter|
    File.write(File.join(source, file), "---\n#{front_matter}\n---\nFixture content.\n")
  end

  config = Jekyll.configuration(
    "source" => source,
    "destination" => destination,
    "url" => origin,
    "collections" => { "notes" => { "output" => true } },
    "quiet" => true,
    "disable_disk_cache" => true
  )
  Jekyll::Site.new(config).process

  sitemap = REXML::Document.new(File.read(File.join(destination, "sitemap.xml")))
  urls = sitemap.root.elements.to_a("url")
  actual = urls.to_h do |url|
    modified = url.elements["lastmod"]
    [url.elements["loc"].text, modified && (modified.text || "")]
  end
  expected = {
    "#{origin}/older/" => "2025-02-01",
    "#{origin}/newer/" => "2026-01-15",
    "#{origin}/undated/" => nil,
    "#{origin}/notes/dated/" => "2024-10-02",
    "#{origin}/notes/undated/" => nil
  }

  abort "Unexpected sitemap entries: #{actual.inspect}" unless actual == expected && urls.size == expected.size
end

puts "Sitemap dates and URLs are correct."
