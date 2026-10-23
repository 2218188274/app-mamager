Pod::Spec.new do |s|
  s.name = 'ChatQKeyboard'
  s.version = '1.0.0'
  s.summary = 'ChatQ keyboard shared configuration'
  s.description = 'Shares server configuration between the host and keyboard extension.'
  s.author = 'ChatQ'
  s.homepage = 'https://github.com/ljx0517/app-mamager'
  s.license = { :type => 'MIT' }
  s.platforms = { :ios => '15.1' }
  s.source = { :git => 'https://github.com/ljx0517/app-mamager.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version = '5.9'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
