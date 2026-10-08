## Error sweep: start a promoter career, open every window, step through a few days and a fight night
extends RefCounted

func run(m) -> void:
	var dir = OS.get_environment("SHOTS")
	await m.wait(3.0)
	m.click(86, 100)  # MODES
	await m.wait(1.0)
	m.click(52, 218)  # PROMOTER: PLAY
	await m.wait(1.5)
	m.click(420, 248)  # START
	await m.wait(5.0)
	for i in 4:
		m.click(403, 233)  # CONTINUE
		await m.wait(1.0)
	m.click(328, 155)  # I'VE GOT THIS
	await m.wait(1.0)
	m.click(428, 250)  # TO THE DESK
	await m.wait(3.0)
	var g = m.game
	var noop = func(): pass
	var opens = [
		["chart", func(): M_ui_scenes_chart.openChart(g)],
		["corkboard", func(): M_ui_scenes_corkboard.openCorkboard(g, noop)],
		["credits", func(): M_ui_scenes_credits.openCredits(g)],
		["gamemenu", func(): M_ui_scenes_gamemenu.openGameMenu(g, noop)],
		["inbox", func(): M_ui_scenes_inbox.openInbox(g, noop)],
		["jukebox", func(): M_ui_scenes_jukebox.openJukebox(g)],
		["ledger", func(): M_ui_scenes_ledger.openLedgerPeek(g)],
		["load", func(): M_ui_scenes_loadmenu.openLoad(g)],
		["slots", func(): M_ui_scenes_loadmenu.openSaveSlots(g)],
		["rankings", func(): M_ui_scenes_rankings.openRankings(g)],
		["roster", func(): M_ui_scenes_roster.openRoster(g, noop)],
		["settings", func(): M_ui_scenes_settings.openSettings(g)],
		["editor", func(): M_ui_scenes_editor_fighter.openFighterEditor(g, null, noop)],
		["help", func(): M_ui_help.openHelp(g)],
		["achievements", func(): M_ui_achievements.openAchievements(g)],
	]
	for o in opens:
		printerr("open ", o[0])
		o[1].call()
		JS.flush_microtasks()
		await m.wait(1.2)
		if OS.get_environment("SWEEP_SHOTS") != "": await m.shot(dir + "/sweep_%s.png" % o[0])
		g.closeAllModals()
		await m.wait(0.3)
	# play days: end day repeatedly (auto-processing through dialogs with Enter / Escape)
	for d in 12:
		printerr("day ", d)
		m.click(441, 60)  # END DAY
		await m.wait(2.0)
		for k in 6:
			m.key("Enter")
			await m.wait(0.4)
		g.closeAllModals()
		await m.wait(0.5)
		await m.shot(dir + "/sweep_day.png")
	m.get_tree().quit()
