## Port of src/core/rng.ts (mulberry32 + FNV-1a). It must stay bit-for-bit identical:
## tests/rng_check.gd and tools/port-check.mjs print the same numbers (diff them).
class_name Rng
extends RefCounted

const M32 := 0xFFFFFFFF
var state: int

func _init(s: int) -> void:
	state = s & M32

static func _s32(x: int) -> int:
	x &= M32
	return x - 0x100000000 if x >= 0x80000000 else x

static func imul(a: int, b: int) -> int:
	return _s32((a & M32) * (b & M32))

static func hash_string(s: String) -> int:
	var h := 0x811c9dc5
	for i in s.length():
		h ^= s.unicode_at(i)
		h = imul(h, 0x01000193) & M32
	return h & M32

func next() -> float:
	var s := _s32(state + 0x6d2b79f5)
	var t := s
	t = imul(t ^ ((t & M32) >> 15), t | 1)
	t = _s32(t ^ _s32(t + imul(t ^ ((t & M32) >> 7), t | 61)))
	var out := float((t ^ ((t & M32) >> 14)) & M32) / 4294967296.0
	state = s & M32
	return out

func int_range(lo: int, hi: int) -> int:
	return lo + int(floor(next() * (hi - lo + 1)))

func gauss() -> float:
	return (next() + next() + next() - 1.5) * 2
