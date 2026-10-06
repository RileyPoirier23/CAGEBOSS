from dsl import *

FILE = 'president'

S(FILE, 'pres_casino', 'Whale Watching', 'president',
  [phone("Bad news. Somebody filmed you at the high-roller craps table last night screaming 'DADDY NEEDS A NEW CAGE' and slapping a whale on the back so hard he dropped his chips. The video is called 'Fight Boss Loses It'. It's everywhere.", "Your PR director, Tiffani")],
  [C("Laugh it off on a podcast", "media -= 2", "fans += 2", "heat += 1", result="You go on The Joe Brogan Experience for four hours. You talk about the casino for 40 minutes and elk meat for 3 hours and 20.", bot=1, default=True),
   C("Apologize to the whale", "wealth -= 20000", "media += 1", result="The whale accepts your apology and asks to invest in the promotion. He is now a minority owner. Of a casino.", ethics=1),
   C("Double down: book a VIP craps night at the next event", "earn('vip packages', 60000 * scale)", "commission -= 3", "heat += 3", "president.vegasDebt += 50000", result="'Craps & Cagefights' sells out. The commission is going to need to see some paperwork.", bot=2, ethics=-2)],
  cd=40, chain='pres_vegas')

S(FILE, 'pres_vegas_markers', 'The Markers', 'president',
  [phone("Mr. President, it's the casino. Friendly call. You signed some markers last month. {$debt} worth. We'd love to discuss repayment, or 'a mutually beneficial partnership'.", "Casino host Vinnie")],
  [C("Pay it off personally", "wealth -= vars.debt", "heat -= 1", result="You pay. Your spouse finds the bank statement. That's a separate storyline.", default=True, ethics=1),
   C("Make the casino the official sponsor instead", "earn('sponsors', vars.debt * 0.5)", "commission -= 4", "heat += 3", "president.vegasDebt = 0", result="'Lucky Buck Casino: Official Gaming Partner.' The commission is going to need to see some more paperwork.", bot=2, ethics=-2)],
  cond="president.vegasDebt > 0 || since('pres_casino') < 30", vars={"debt": money(40, 150)}, cd=40, chain='pres_vegas')

S(FILE, 'pres_reporter_fight', 'You vs. The Reporter', 'president',
  [sc('visit', "{reporter.name} from {reporter.outlet} ambushes you in the parking garage with a camera and a question about fighter pay. You respond with a word that rhymes with 'duck'. He asks a follow-up. You respond with the same word, louder.", "{reporter.name}", "reporter")],
  [C("Apologize publicly", "media += 2", "reporter.rel += 10", result="You apologize. He accepts. He also publishes the footage.", ethics=1, default=True),
   C("Ban {reporter.name} from all events", "ban(reporter)", "media -= 4", "reporter.rel -= 40", "follow('pres_banned_reporter_back', 8)", result="Banned. The Streisand effect kicks in immediately. {reporter.name}'s next story is about you banning him. It does huge numbers.", bot=1),
   C("Challenge him to a charity boxing match", "media -= 1", "fans += 3", "reporter.rel -= 5", "earn('charity event', 40000 * scale)", result="The charity match happens. You lose. By KO. The charity raises $2M. Worth it?", ethics=-1)],
  roles={"reporter": R("f.rel < 20")}, cd=40, chain='pres_press')

S(FILE, 'pres_banned_reporter_back', 'The Return of the Banned', 'media',
  [phone("{reporter.name} is outside the venue in a fake moustache and a lanyard that says 'Bob from Catering'. Security wants to know what to do.", "Your head of security")],
  [C("Let him in. It's funnier.", "unban(reporter)", "media += 2", "reporter.rel += 10", result="He covers the event in the moustache. It becomes his signature look.", default=True),
   C("Throw him out", "media -= 2", "reporter.rel -= 10", result="Security escorts Bob from Catering out. The video gets 5 million views.", bot=1)],
  roles={"reporter": R("f.banned")}, fu=True, chain='pres_press')

S(FILE, 'pres_leaked_texts', 'Leaked Texts', 'president',
  [doc("A screenshot of your group chat with the matchmakers has leaked. Your messages include 'these guys would fight for a sandwich', 'book the guy with the big chin, he never dies', and nine skull emojis.", "SCREENSHOT (LEAKED)")],
  [C("Claim it's fake", "media -= 3", "fighters -= 4", "heat += 2", result="'Fake.' Several fighters post screenshots of you sending them the exact same emojis.", bot=1, default=True),
   C("Apologize to the roster", "fighters += 2", "media += 1", "patience -= 2", result="You give a speech in the locker room. It's surprisingly heartfelt. Someone films it. It also leaks.", ethics=1),
   C("Find the leaker", "heat += 2", "follow('media_mole_hunt', 2)", result="Somebody in your building is talking. You will find them.")],
  cond="act >= 2", cd=60, chain='pres_press')

S(FILE, 'pres_politics', 'The Senator', 'president',
  [phone("A senator wants you to appear at a rally. 'Big fan, big fan. Love the fights. Would love you to say a few words. And maybe the Fight Boss endorsement?' He sounds like a man who has never watched a fight.", "Senator Dick Ballsworth")],
  [C("Go to the rally", "media -= 3", "fans += 1", "heat += 3", "flag.politics += 1", "follow('pres_politics_2', 10)", result="You speak for six minutes. You say 'I'll put them all in the cage' twice. The crowd loves it. Half your audience is now furious.", bot=1),
   C("Decline politely", "media += 1", result="You decline. He endorses a slap league instead.", default=True)],
  cond="act >= 3", cd=104, chain='politics')

S(FILE, 'pres_politics_2', 'The Hearing', 'president',
  [doc("The Senate Commerce Committee 'requests' your testimony regarding fighter pay, brain injuries and 'the promotion's relationship with Senator Ballsworth'.", "CONGRESSIONAL SUMMONS")],
  [C("Testify honestly", "heat -= 5", "media += 4", "patience -= 5", "fighters += 3", result="You tell the truth for three hours. Nobody has ever seen a promoter do that. The board is horrified.", ethics=3),
   C("Testify like it's a press conference", "heat += 6", "fans += 3", "flag.politics += 2", "follow('pres_politics_3', 26)", result="You call a senator 'a bum' on live TV. Your approval rating goes up. Not with the senators.", bot=1, default=True)],
  fu=True, chain='politics')

S(FILE, 'pres_politics_3', 'Run For Office?', 'president',
  [visit("A political consultant in a vest is in your office. 'Polls show you at 38% for an open Senate seat. People like a guy who yells. You yell. Let's talk.'", "Consultant Chet")],
  [C("Run for office (this ends your career here)", "endGame('politics')", "setFlag('ending_politics', 1)", result="You announce your candidacy at a weigh-in. You punch a cardboard cutout of your opponent. It's over. It's just beginning.", bot=0),
   C("Stay in the fight business", "fans += 2", result="'I already run something more important than the country.'", default=True)],
  cond="act >= 4", fu=True, chain='politics')

S(FILE, 'pres_slap_league', 'The Slap League', 'venture',
  [visit("A man in a tracksuit pitches you: 'Slap fighting. Two guys, one table, no defense. You just... take it. Costs nothing to produce. Ratings are insane.' His face is visibly swollen.", "Slap promoter Dusty")],
  [C("Launch the slap league", "venture('slap')", "fans -= 3", "commission -= 5", "media -= 3", "network += 4", "flag.slap = 1", "follow('slap_first_event', 3)", result="'POWER SLAP SHOWDOWN presented by {promotion}.' Doctors draft a joint letter. The ratings arrive before the letter.", bot=2, ethics=-2),
   C("Absolutely not", "commission += 1", "media += 1", result="You pass. Dusty slaps himself on the way out. For practice.", default=True)],
  cond="act >= 2 && venture == ''", cd=104, once=True, chain='slap')

S(FILE, 'pres_reality_show', 'The Reality Show', 'venture',
  [phone("A network wants a reality show: 16 prospects in a house, one contract. 'We'll need conflict. Like, a lot of it. We'll handle the alcohol budget.'", "Network producer Kendra")],
  [C("Make the show", "venture('reality')", "network += 6", "fans += 3", "follow('reality_house_drama', 4)", result="'The Ultimate Fighter Who Lives In A House' is greenlit. The house has a pool. The pool will be a problem.", bot=2),
   C("Pass", "network -= 1", result="They make it with a rival. The rival's prospects become famous.", default=True)],
  cond="act >= 2 && venture == ''", cd=104, once=True, chain='reality')

S(FILE, 'pres_energy_drink', 'Your Own Energy Drink', 'venture',
  [visit("A beverage executive with very white teeth wants to launch 'BOSS JUICE', an energy drink with your face on it. '400mg of caffeine. Legally that's fine. Ethically that's fine. Medically we're still checking.'", "BevCo executive")],
  [C("Launch BOSS JUICE", "venture('energy')", "wealth += 200000", "sponsors += 4", "follow('energy_drink_recall', 20)", result="BOSS JUICE launches. It tastes like a battery dipped in Skittles. It sells out.", bot=2),
   C("Pass", result="The drink launches with someone else's face on it. A slap fighter's.", default=True)],
  cond="act >= 3 && venture == ''", cd=104, once=True, chain='energy')

S(FILE, 'pres_celebrity_boxer', 'The Celebrity Feud', 'president',
  [sc('social', "A celebrity boxing influencer has posted a video calling you 'a bald thumb who pays fighters in exposure'. It has 40 million views. He's challenging you to a fight. Or a 'debate'. Or a podcast. Whatever gets clicks.")],
  [C("Respond with a diss video", "fans += 2", "media -= 2", "network += 2", result="Your diss video is three minutes long and mostly you yelling in a parking lot. It does huge numbers.", bot=1, default=True),
   C("Ignore it", "media += 1", "fans -= 1", result="Silence. He makes four more videos about your silence.")],
  cond="act >= 2", cd=52)

S(FILE, 'pres_bald_joke', 'The Wig Rumor', 'president',
  [sc('social', "A fan account posted an edited photo of you with a full head of hair. 2 million likes. The caption: 'the president if he paid fighters'. Your own staff are sharing it.")],
  [C("Post it yourself with 'lol'", "fans += 2", "media += 1", result="Self-deprecation. The internet briefly respects you.", default=True),
   C("Demand it be taken down", "media -= 2", "fans -= 1", result="The Streisand effect strikes again. It's now on a billboard.")],
  cd=104)

# ---------------------------------------------------------------- family
S(FILE, 'family_anniversary', 'Anniversary', 'family',
  [phone("It's your spouse. 'Do you know what today is?' You do not know what today is. 'It's our anniversary. You're at a weigh-in in Tulsa. AGAIN.'", "Your spouse")],
  [C("Fly home immediately (miss the event)", "wealth -= 15000", "fans -= 1", "flag.marriage_points += 2", result="You fly home with flowers bought at the airport. They're from a vending machine. It's the thought that counts.", ethics=2),
   C("Send something expensive", "wealth -= 30000", "flag.marriage_points += 1", result="A bracelet. It says 'sorry' in diamonds. Diamonds can't fix everything, but they can fix some things.", default=True),
   C("'I'm building an empire, babe'", "flag.marriage_points -= 3", "follow('family_separation', 8)", result="Silence on the line. Then a dial tone. That dial tone will cost you.", bot=1)],
  cond="president.marriage == 'married'", cd=52, chain='marriage')

S(FILE, 'family_separation', 'Separation', 'family',
  [doc("Your spouse has moved out and hired a divorce lawyer named Gloria who is known in legal circles as 'The Guillotine'. Her retainer letter is printed on black paper.", "LETTER FROM COUNSEL")],
  [C("Couples therapy ({$fee})", "wealth -= vars.fee", "president.marriage = 'married'", "flag.marriage_points += 2", result="The therapist asks you to 'leave the business at the door'. You bring the business to every session.", ethics=1),
   C("Lawyer up", "president.marriage = 'separated'", "follow('family_divorce_final', 20)", result="Your lawyer is good. Hers is The Guillotine.", default=True)],
  vars={"fee": money(5, 15)}, fu=True, chain='marriage')

S(FILE, 'family_divorce_final', 'The Divorce', 'family',
  [doc("Final settlement: your ex gets the house, the boat, half your personal wealth, and the dog, whose name was 'Main Event'.", "DIVORCE DECREE")],
  [C("Sign", "wealth *= 0.5", "president.marriage = 'divorced'", "president.lifestyle = 1", result="Divorced. You buy a condo with a view of an arena. You eat cereal for dinner.", default=True)],
  fu=True, chain='marriage')

S(FILE, 'family_kid_school', 'Private School Fees', 'family',
  [doc("Tuition notice from Westbrook Academy: {$fee} for the semester, plus a 'voluntary' contribution to the new lacrosse pavilion. Your kid has been suspended twice for 'demonstrating rear-naked chokes'.", "TUITION NOTICE")],
  [C("Pay it", "wealth -= vars.fee", result="Paid. The lacrosse pavilion will have your name on a brick.", default=True),
   C("Move the kid to public school", "president.kidsSchool = false", "flag.marriage_points -= 1", result="Your kid is thrilled. Public school has a wrestling team.")],
  cond="president.kidsSchool", vars={"fee": money(20, 45)}, cd=52)

S(FILE, 'family_kid_fights', 'Your Kid Wants to Fight', 'family',
  [visit("Your teenager walks into your office with a mouthguard. 'I want to be a fighter. I've been training at {fighter.gym} with {fighter.first} for three months.' {fighter.first} is standing behind them, looking guilty.", "Your kid")],
  [C("Support it", "fighter.loyalty += 10", "flag.kid_fighter = 1", result="Your kid wins their first amateur bout. You cry harder than you have at any event you've promoted.", ethics=1, default=True),
   C("Absolutely not", "fighter.loyalty -= 5", "flag.marriage_points += 1", result="'I've seen what this does to people.' You've also profited from what this does to people. Your kid points this out.")],
  roles={"fighter": F("f.ours && f.traits.has('Mentor') || f.ours && f.traits.has('Wholesome')")}, cond="act >= 3", once=True)

S(FILE, 'pres_lifestyle', 'Upgrade?', 'president',
  [visit("Your business manager is here with brochures: a yacht, a jet share, and a watch that 'tells time in four dimensions'. 'You've earned it. Also people will respect you more. Probably.'", "Your business manager")],
  [C("Go full whale (yacht, jet, watch)", "lifestyle(2)", "wealth -= 500000", "media -= 1", result="You are now a man with a yacht. You get seasick. You keep the yacht.", bot=1),
   C("A modest upgrade", "lifestyle(1)", "wealth -= 50000", result="A nicer car. A nicer watch. Same bald head.", default=True),
   C("Stay humble", "fighters += 1", result="You keep driving the 2009 truck. The fighters respect it. Your spouse does not.", ethics=1)],
  cond="wealth > 1000000 && president.lifestyle < 2", cd=104)

S(FILE, 'pres_ref_course', 'The Online Course', 'misc',
  [doc("An email arrives: 'BECOME A LICENSED MMA REFEREE IN 6 WEEKS! 100% ONLINE! Endorsed by Nerm Bean.' You hover over the link for an unusually long time.", "EMAIL")],
  [C("Enroll (secretly)", "setFlag('ref_license', 1)", "wealth -= 499", result="You pass the final exam. The final exam was a single question: 'Is he OK?' The correct answer was 'let him fight'.", bot=0),
   C("Delete the email", result="Deleted. But you'll think about it.", default=True)],
  cond="act >= 4", once=True, weight=4)

S(FILE, 'pres_desert_offer', 'The Desert Kingdom', 'business',
  [visit("A delegation from the Kingdom of Qasr sits in your office. They do not blink. 'His Excellency would like to buy your promotion. All of it. And you. Name a number. Then add a zero. Then we add another.'", "Royal envoy")],
  [C("Sell everything (this ends your career here)", "endGame('desert')", "setFlag('ending_desert', 1)", "wealth += 500000000", result="You sign. A golden pen. A golden cage. A passport you are not allowed to use.", bot=1, ethics=-3),
   C("Host one mega-event there instead", "unlockVenue('desert_kingdom')", "earn('site fees', 30000000 * scale)", "media -= 6", "heat += 4", result="One event. The site fee alone is more than your first five years combined. Human rights groups send you a very long email.", bot=2, default=True, ethics=-2),
   C("Decline", "media += 3", "fighters += 1", result="You decline. The envoy smiles in a way that suggests 'for now'.", ethics=2)],
  cond="act >= 4", once=True, chain='desert')
