#!/usr/bin/env ruby
# One-time: adds the "NotificationService" extension target (images in push notifications) to the
# iOS project and embeds it in the App target. Safe to re-run (skips if the target exists).
# Uses the xcodeproj gem that ships with CocoaPods.
require 'xcodeproj'

ROOT = File.expand_path('../ios/App', __dir__)
project_path = File.join(ROOT, 'App.xcodeproj')
project = Xcodeproj::Project.open(project_path)

existing = project.targets.find { |t| t.name == 'NotificationService' }
if existing
  # Repair: an earlier run left PRODUCT_NAME empty, which makes Xcode build a nameless ".appex".
  existing.build_configurations.each do |c|
    c.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
    c.build_settings['PRODUCT_MODULE_NAME'] = 'NotificationService'
  end
  project.save
  puts 'NotificationService target already exists — repaired PRODUCT_NAME.'
  exit 0
end

app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')
app_cfg = app.build_configurations.first.build_settings
team = app_cfg['DEVELOPMENT_TEAM']
app_bundle = app_cfg['PRODUCT_BUNDLE_IDENTIFIER']

ext = project.new_target(:app_extension, 'NotificationService', :ios, '15.0')
group = project.main_group.new_group('NotificationService', 'NotificationService')
src = group.new_file('NotificationService.swift')
group.new_file('Info.plist')
ext.add_file_references([src])

ext.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['PRODUCT_MODULE_NAME'] = 'NotificationService'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{app_bundle}.NotificationService"
  s['INFOPLIST_FILE'] = 'NotificationService/Info.plist'
  s['DEVELOPMENT_TEAM'] = team if team
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['MARKETING_VERSION'] = app_cfg['MARKETING_VERSION'] || '1.0'
  s['CURRENT_PROJECT_VERSION'] = app_cfg['CURRENT_PROJECT_VERSION'] || '1'
  s['SKIP_INSTALL'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
end

app.add_dependency(ext)
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' || p.name == 'Embed App Extensions' }
unless embed
  embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
end
build_file = embed.add_file_reference(ext.product_reference, true)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
puts 'Added NotificationService target and embedded it in App. Open Xcode, select the NotificationService target > Signing & Capabilities, and confirm your team.'
