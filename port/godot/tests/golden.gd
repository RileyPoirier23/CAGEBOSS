## godot --headless --path port/godot -s tests/golden.gd -- [scenario,...]
## Runs tools/golden/scenarios.ts (translated) and writes tests/golden/<name>.godot.json
extends SceneTree

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var t0 := Time.get_ticks_msec()
	M_core_content.setContent(M_core_content.buildContent(ContentLoader.load_all()))
	print("content: %d ms" % (Time.get_ticks_msec() - t0))
	var names: Array = M_tools_golden_scenarios.SCENARIOS if args.is_empty() else Array(args[0].split(","))
	for name in names:
		var t := Time.get_ticks_msec()
		var r = M_tools_golden_scenarios.runScenario(name)
		var f := FileAccess.open("res://tests/golden/%s.godot.json" % name, FileAccess.WRITE)
		f.store_string(JS.json_stringify(r))
		f.close()
		print("%s: %d ms" % [name, Time.get_ticks_msec() - t])
	quit()
