from dsl import *

FILE = 'venture'

# ---------------------------------------------------------------- Slap league chain
S(FILE, 'slap_first_event', 'Slap Night One', 'venture',
  [sc('headline', "POWER SLAP SHOWDOWN debuts. A man named 'Big Hands' Doug was slapped unconscious in round one and woke up speaking fluent Portuguese. Ratings: enormous. Doctors: furious.")],
  [C("Expand it to weekly shows", "earn('side venture', 150000 * scale)", "network += 4", "fans -= 3", "commission -= 4", "follow('slap_scandal', 10)", result="Weekly slaps. Your MMA fans write long, angry essays. Then they watch.", bot=2),
   C("Keep it to a quarterly special", "earn('side venture', 60000 * scale)", "fans -= 1", result="Quarterly. A controlled amount of slapping.", default=True)],
  fu=True, chain='slap')

S(FILE, 'slap_scandal', 'The Slap Heard Round the World', 'venture',
  [phone("A slap fighter has been hospitalized after taking 'the slap of the century'. He's going to be okay. The video has 200 million views. A senator is calling slap fighting 'the end of civilization'. The slap league just outrated your last MMA PPV.", "Slap promoter Dusty")],
  [C("Go all in on slapping", "earn('side venture', 400000 * scale)", "fans -= 6", "fighters -= 3", "media -= 5", "follow('slap_forever', 26)", "addFlag('slap', 2)", result="You announce a 'Slap World Championship'. Your MMA roster feels quietly betrayed.", bot=2, ethics=-2),
   C("Add medical rules and slow down", "commission += 3", "media += 2", "earn('side venture', 50000 * scale)", result="Mandatory neurologists. Fewer KOs. Fewer views. More sleep.", default=True, ethics=1),
   C("Shut it down", "venture('')", "fans += 3", "commission += 4", "fighters += 2", result="Slap league over. Dusty slaps himself goodbye.")],
  fu=True, chain='slap')

S(FILE, 'slap_forever', 'Slap League Forever?', 'venture',
  [memo("The board notes that the slap league now generates more profit than MMA with 4% of the cost. They propose 'transitioning the brand'. They have prepared a PowerPoint. Slide 1 is a hand.", "MEMO: STRATEGIC PIVOT")],
  [C("Pivot to slapping full time (this ends your career here)", "endGame('slap_forever')", "setFlag('ending_slap_forever', 1)", result="You become the King of Slaps. History will judge you. History is also watching.", bot=1, ethics=-3),
   C("Refuse. MMA is the business.", "patience -= 8", "fans += 4", "fighters += 3", result="You give a speech about 'real fighting'. The board writes 'sentimental' in your file.", ethics=2, default=True)],
  fu=True, chain='slap')

# ---------------------------------------------------------------- Reality show chain
S(FILE, 'reality_house_drama', 'The House', 'venture',
  [sc('narration', "Episode 3 of the reality show: a contestant threw a couch into the pool, two others got into a fight over a yogurt, and one guy has been hiding in a closet for two days 'visualizing'. The producers are thrilled.")],
  [C("Let the cameras roll", "earn('side venture', 120000 * scale)", "network += 3", "fans += 2", "follow('reality_finale', 8)", result="Ratings up 40%. The yogurt has its own fan page.", default=True, bot=1),
   C("Bring in a coach to restore order", "network -= 1", "media += 1", "follow('reality_finale', 8)", result="Order is restored. Ratings dip. The coach gets thrown in the pool anyway.")],
  fu=True, chain='reality')

S(FILE, 'reality_finale', 'The Finale', 'venture',
  [sc('narration', "The reality-show finale: the two finalists are the guy who threw the couch and the guy from the closet. The winner gets a contract with {promotion}.")],
  [C("Sign both finalists", "earn('side venture', 200000 * scale)", "fans += 3", "follow('reality_season2', 26)", result="Two new prospects. One throws furniture. The other hides. Both have 500,000 followers.", default=True),
   C("Sign only the winner", "earn('side venture', 150000 * scale)", "follow('reality_season2', 26)", result="One contract, one runner-up who now has a YouTube channel about 'being robbed'.")],
  fu=True, chain='reality')

S(FILE, 'reality_season2', 'Season Two', 'venture',
  [phone("Season two is greenlit if you agree to 'more drama'. Their notes: 'more alcohol, more exes, one contestant who is secretly a spy'.", "Network producer Kendra")],
  [C("Agree to everything", "earn('side venture', 250000 * scale)", "network += 4", "media -= 2", "chaos += 2", result="The spy contestant is real. Nobody knows for whom.", bot=2),
   C("Make it about the fighting", "earn('side venture', 100000 * scale)", "fans += 3", "media += 2", result="A show about fighting. Novel. Critics love it. Fewer people watch.", default=True, ethics=1)],
  fu=True, chain='reality')

# ---------------------------------------------------------------- Energy drink chain
S(FILE, 'energy_drink_recall', 'BOSS JUICE Recall', 'venture',
  [doc("RECALL NOTICE: BOSS JUICE 'Knockout Grape' has been found to contain 'significantly more caffeine than legally possible'. Reported side effects: tremors, visions, and in one case 'seeing through time'.", "FOOD SAFETY AGENCY")],
  [C("Issue a full recall and refunds ({$fee})", "spend('recall costs', vars.fee)", "media += 2", "sponsors += 1", result="Recalled. The cans become collectors' items. A full can sells for $400 online.", ethics=2, default=True),
   C("Rebrand it as 'BOSS JUICE EXTREME'", "earn('side venture', 200000 * scale)", "heat += 4", "commission -= 3", result="The rebrand is a hit until a fan runs through a wall. The wall is fine. The fan sues.", bot=2, ethics=-2)],
  vars={"fee": money(100, 300)}, fu=True, chain='energy')

S(FILE, 'energy_drink_sponsor_clash', 'Sponsor Clash', 'venture',
  [phone("{sponsor.name} is furious that your own energy drink is being promoted in the same cage as their energy drink. They want exclusivity or they walk.", "{sponsor.name} rep")],
  [C("Drop your own drink from the cage", "earn('sponsors', 40000 * scale)", "wealth -= 50000", result="Their logo stays. Your face comes off the cans in the arena. A small personal loss.", default=True),
   C("Drop them", "dropSponsor(sponsor)", "sponsors -= 3", "wealth += 80000", result="BOSS JUICE: the only energy drink in the cage.", bot=1)],
  roles={"sponsor": SP("f.category == 'energy'")}, cond="venture == 'energy'", cd=52, chain='energy')
