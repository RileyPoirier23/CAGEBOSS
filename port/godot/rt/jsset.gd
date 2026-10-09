## JavaScript Set (insertion ordered).
class_name JSSet
extends RefCounted

var _d := {}
var size: float:
	get: return float(_d.size())

func _init(items = null) -> void:
	if items != null:
		for x in JS.iter(items): add(x)

var _objs: Array = []

## JS compares object keys by identity; Godot hashes dictionaries/arrays by content,
## so objects get a synthetic key (a Vector2i can never be a JS value).
func _k(x):
	var t = typeof(x)
	if t == TYPE_INT: return float(x)
	if t == TYPE_DICTIONARY or t == TYPE_ARRAY:
		for i in _objs.size():
			if is_same(_objs[i], x): return Vector2i(-1, i)
		_objs.append(x)
		return Vector2i(-1, _objs.size() - 1)
	return x

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
