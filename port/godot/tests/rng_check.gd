## godot --headless --path port/godot -s tests/rng_check.gd
## Prints the same numbers as `node tools/port-check.mjs` (run both and diff: identical = the port draws
## exactly the same random numbers as the TypeScript game).
extends SceneTree

func _init() -> void:
	var r := Rng.new(Rng.hash_string("cage boss"))
	var out := PackedStringArray()
	out.append(str(Rng.hash_string("Spadam Biggs")))
	for i in 100000:
		var v := r.next()
		if i % 10000 == 0: out.append(str(int(v * 4294967296.0)))
	out.append(str(r.int_range(1, 100)))
	out.append("%.15f" % r.gauss())
	out.append(str(r.state))
	print("\n".join(out))
	quit()
