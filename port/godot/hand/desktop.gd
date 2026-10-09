## Godot version of src/desktop.ts: the desktop bridge (quit, fullscreen) on PC builds.
class_name M_desktop

class Bridge extends RefCounted:
	func quit() -> void:
		M_desktop._tree().quit()
	func setFullscreen(on) -> void:
		var want = DisplayServer.WINDOW_MODE_FULLSCREEN if JS.truthy(on) else DisplayServer.WINDOW_MODE_WINDOWED
		if DisplayServer.window_get_mode() != want: DisplayServer.window_set_mode(want)
	func isFullscreen():
		var m = DisplayServer.window_get_mode()
		return JSPromise.resolve(m == DisplayServer.WINDOW_MODE_FULLSCREEN or m == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN)

static func _tree() -> SceneTree:
	return Engine.get_main_loop() as SceneTree

static var desktop = Bridge.new() if OS.has_feature("pc") else null
