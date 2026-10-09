## Hand-written parts of src/audio/sfx.ts (see tools/gdport/overrides.json): the two Web Audio
## voices the effects are built from, rendered into sample buffers (cached per parameter set)
## with the same envelopes Web Audio uses, then played on a pool of players.
class_name H_audio_sfx

const RATE := 22050
static var _cache := {}
static var _noise := PackedFloat32Array()
static var _pool: Array = []

## no Web Audio context in Godot; the music synth that needed it is retired
static func ac(): return null
static func unlock() -> void: pass

static func _player() -> AudioStreamPlayer:
	for p in _pool:
		if is_instance_valid(p) and not p.playing: return p
	var p = AudioStreamPlayer.new()
	PXHost.inst.add_child(p)
	_pool.append(p)
	return p

static func _play(key: String, render: Callable, delay) -> void:
	if PXHost.inst == null or M_audio_sfx.muted: return
	var st: AudioStreamWAV = _cache.get(key)
	if st == null:
		st = _wav(render.call())
		_cache[key] = st
	var vol = M_audio_sfx.sfxVol
	var go = func():
		var p = _player()
		p.stream = st
		p.volume_db = linear_to_db(maxf(vol, 0.0001))
		p.play()
	var d = float(delay) if delay != null else 0.0
	if d > 0.0: PXHost.inst.get_tree().create_timer(d).timeout.connect(go)
	else: go.call()

static func _wav(samples: PackedFloat32Array) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32767.0))
	var w = AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = bytes
	return w

## Web Audio exponentialRampToValueAtTime between (t0, v0) and (t1, v1)
static func _exp(v0: float, v1: float, t: float, t0: float, t1: float) -> float:
	if t <= t0: return v0
	if t >= t1: return v1
	return v0 * pow(v1 / v0, (t - t0) / (t1 - t0))

static func tone(freq, dur, type = null, vol = null, slide = null, delay = null, dest = null) -> void:
	if dest != null: return # the retired chiptune
	var f0 = float(freq)
	var d = float(dur)
	var ty = "square" if type == null else str(type)
	var v = 0.3 if vol == null else float(vol)
	var sl = 0.0 if slide == null else float(slide)
	var key = "t%d|%.3f|%s|%.3f|%d" % [int(f0), d, ty, v, int(sl)]
	var render = func():
		var n = int((d + 0.02) * RATE)
		var out := PackedFloat32Array()
		out.resize(n)
		var f1 = maxf(20.0, f0 + sl)
		var phase := 0.0
		for i in n:
			var t = float(i) / RATE
			var f = _exp(f0, f1, t, 0.0, d) if sl != 0.0 else f0
			phase = fmod(phase + f / RATE, 1.0)
			var s: float
			match ty:
				"sine": s = sin(phase * TAU)
				"triangle": s = 1.0 - 4.0 * absf(phase - 0.5)
				"sawtooth": s = 2.0 * phase - 1.0
				_: s = 1.0 if phase < 0.5 else -1.0
			out[i] = s * _exp(v, 0.001, t, 0.0, d)
		return out
	_play(key, render, delay)

static func noise(dur, vol = null, filterFreq = null, q = null, delay = null, attack = null, type = null) -> void:
	var d = float(dur)
	var v = 0.3 if vol == null else float(vol)
	var ff = 1200.0 if filterFreq == null else float(filterFreq)
	var qq = 0.7 if q == null else float(q)
	var at = 0.005 if attack == null else float(attack)
	var ty = "lowpass" if type == null else str(type)
	var key = "n%.3f|%.3f|%d|%.2f|%.3f|%s" % [d, v, int(ff), qq, at, ty]
	var render = func():
		if _noise.is_empty():
			var rng = RandomNumberGenerator.new()
			rng.seed = 7
			_noise.resize(RATE * 2)
			for i in _noise.size(): _noise[i] = rng.randf() * 2.0 - 1.0
		# RBJ biquad, as Web Audio's BiquadFilterNode
		var w0 = TAU * ff / RATE
		var alpha = sin(w0) / (2.0 * maxf(qq, 0.0001))
		var cw = cos(w0)
		var b0: float
		var b1: float
		var b2: float
		match ty:
			"highpass":
				b0 = (1.0 + cw) / 2.0
				b1 = -(1.0 + cw)
				b2 = (1.0 + cw) / 2.0
			"bandpass":
				b0 = alpha
				b1 = 0.0
				b2 = -alpha
			_:
				b0 = (1.0 - cw) / 2.0
				b1 = 1.0 - cw
				b2 = (1.0 - cw) / 2.0
		var a0 = 1.0 + alpha
		var a1 = -2.0 * cw
		var a2 = 1.0 - alpha
		var n = int((d + 0.05) * RATE)
		var out := PackedFloat32Array()
		out.resize(n)
		var x1 := 0.0
		var x2 := 0.0
		var y1 := 0.0
		var y2 := 0.0
		var start = randi() % RATE
		for i in n:
			var x = _noise[(start + i) % _noise.size()]
			var y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
			x2 = x1
			x1 = x
			y2 = y1
			y1 = y
			var t = float(i) / RATE
			var g = _exp(0.0001, v, t, 0.0, at) if t < at else _exp(v, 0.001, t, at, d)
			out[i] = y * g
		return out
	_play(key, render, delay)
