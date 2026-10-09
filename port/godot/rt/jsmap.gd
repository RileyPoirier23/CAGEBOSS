## JavaScript Map (insertion ordered).
class_name JSMap
extends RefCounted

var _keys := {}
var _vals := {}
var size: float:
	get: return float(_vals.size())

func _init(items = null) -> void:
	if items != null:
		for e in JS.iter(items): set_(e[0], e[1])

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

func has(k) -> bool: return _vals.has(_k(k))
func get_(k): return _vals.get(_k(k))
func set_(k, v) -> JSMap:
	var kk = _k(k)
	_keys[kk] = k
	_vals[kk] = v
	return self
func del(k) -> bool:
	var kk = _k(k)
	_keys.erase(kk)
	return _vals.erase(kk)
func clear() -> void:
	_keys.clear()
	_vals.clear()
func keys() -> Array: return _keys.values()
func values() -> Array: return _vals.values()
func entries() -> Array:
	var out: Array = []
	for kk in _vals: out.append([_keys[kk], _vals[kk]])
	return out
func for_each(f) -> void:
	for kk in _vals: JS.call_(f, [_vals[kk], _keys[kk], self])
