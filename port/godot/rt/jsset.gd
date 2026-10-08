## JavaScript Set (insertion ordered).
class_name JSSet
extends RefCounted

var _d := {}
var size: float:
	get: return float(_d.size())

func _init(items = null) -> void:
	if items != null:
		for x in JS.iter(items): add(x)

static func _k(x):
	return float(x) if typeof(x) == TYPE_INT else x

func has(x) -> bool: return _d.has(_k(x))
func add(x) -> JSSet:
	_d[_k(x)] = x
	return self
func del(x) -> bool: return _d.erase(_k(x))
func clear() -> void: _d.clear()
func values() -> Array: return _d.values()
func keys() -> Array: return _d.values()
func entries() -> Array:
	var out: Array = []
	for v in _d.values(): out.append([v, v])
	return out
func for_each(f) -> void:
	for v in _d.values(): JS.call_(f, [v, v, self])
