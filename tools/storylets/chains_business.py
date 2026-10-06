"""Business, media, sponsor, venue and promotion arcs (setup -> payoff)."""
from dsl import *

FILE = 'chains_business'
OURS = "f.ours"


def CH(cid, steps, roles=None, cat='business', cond=None, cd=52, weight=8, tags=None, acts=None, vars=None):
    for i, (sid, title, scenes, choices) in enumerate(steps):
        S(FILE, sid, title, cat, scenes, choices, roles=roles, cond=cond if i == 0 else None, cd=cd, weight=weight,
          chain=cid, fu=i > 0, tags=tags, acts=acts if i == 0 else None, vars=vars)


CH('ch_sponsor_mascot', [
    ('sm_pitch', 'The Mascot Deal', [phone("{pop_food} wants to sponsor your next event, on one condition: a seven-foot mascot gets to walk out with the main eventers. The mascot is a sentient chicken nugget named Nuggy.", "Brand partnerships, {pop_food}")],
     [C("Take the money ({$fee})", "earn('sponsors', vars.fee)", "fans -= 1", "follow('sm_night', 3)", result="Nuggy is coming. Nuggy is coming to fight night.", bot=2),
      C("Counter: logo only, no Nuggy", "earn('sponsors', vars.fee * 0.4)", result="They agree, sadly. Nuggy is reportedly devastated.", default=True)]),
    ('sm_night', 'Nuggy Night', [sc('fightnight', "Nuggy walks out with the main eventer, does a little dance, and gets head-kicked by the opponent during the faceoff. The crowd's reaction is the loudest of the year. The clip has 40 million views.")],
     [C("Apologize to the sponsor", "sponsors += 2", "media += 1", result="The sponsor is thrilled. Sales up 300%. Nuggy has a concussion protocol.", default=True),
      C("Book Nuggy vs the opponent", "fans += 3", "commission -= 3", "network += 2", result="The commission writes a very long letter. Nuggy trains with a Muay Thai coach.", bot=2)]),
], vars={"fee": money(40, 120)}, cd=104)

CH('ch_arena_leak', [
    ('al_leak', 'The Roof Leaks', [phone("The arena roof for your next event is leaking. Right over the cage. The venue says it'll be fixed 'in time'. The venue said that last year.", "Venue manager")],
     [C("Pay for an emergency repair ({$fee})", "spend('venue', vars.fee)", result="Fixed. A roofer asks for front-row tickets. You give him two.", default=True),
      C("Put a bucket cageside and hope", "follow('al_rain', 2)", result="A bucket. A professional bucket.", bot=1)]),
    ('al_rain', 'Rain in the Cage', [sc('fightnight', "Midway through the co-main, it rains. Inside. The mat turns into a slip-and-slide. Both fighters fall over at the same time and the crowd gives them a standing ovation.")],
     [C("Call it 'the Water Fight'", "fans += 2", "commission -= 2", "media += 1", result="Shirts that say 'I SURVIVED THE WATER FIGHT' outsell everything.", bot=2, default=True),
      C("Delay the event for repairs", "fans -= 2", "network -= 2", result="The network shows a 40-minute replay of the rain. Ratings go up.")]),
], vars={"fee": money(30, 80)}, cd=104)

CH('ch_documentary', [
    ('dc_pitch', 'Documentary Crew', [phone("A streaming service wants to embed a documentary crew in your promotion for a season. Full access. Every meeting. Every meltdown. Every receipt.", "Megaflix producer")],
     [C("Full access", "network += 3", "media += 2", "follow('dc_episode', 8)", result="Cameras everywhere. Including the bathroom, by accident, once.", bot=2),
      C("Limited access", "network += 1", "follow('dc_episode', 8)", result="They get the fights and the hype. Not the meetings. Not the receipts.", default=True),
      C("No", result="They make one about a rival instead. It wins an award.")]),
    ('dc_episode', 'Episode Three', [sc('headline', "The documentary's third episode, titled 'The Boss', features {president} yelling at a vending machine, crying at a fighter's wedding, and eating a hot dog in a stairwell. Reviews call it 'unhinged', 'human', and 'disgusting'.")],
     [C("Lean into the persona", "fans += 3", "patience -= 2", "media += 1", result="You're a meme now. The board is not thrilled.", bot=2),
      C("Demand edits", "network -= 1", "patience += 2", result="They cut the hot dog. They keep the vending machine.", default=True)]),
], cd=156)

CH('ch_ticket_scalpers', [
    ('ts_bots', 'The Bots', [phone("Your biggest event of the year sold out in 38 seconds. Ticket bots bought 70% of the seats and are reselling them for ten times the price. Fans are furious. Some fans are also the bots.", "Ticketing manager")],
     [C("Cancel the bot orders and resell", "fans += 4", "spend('legal', 20000 * scale)", "follow('ts_lawsuit', 6)", result="The fans love you. The ticketing company's lawyers do not.", default=True, ethics=1),
      C("Take a cut of the resale market", "earn('gate', 150000 * scale)", "fans -= 5", "media -= 2", result="Profitable. Hated. Profitable.", bot=2, ethics=-2)]),
    ('ts_lawsuit', 'The Bot Lawsuit', [doc("NOTICE OF CLAIM: SecondHand Seats LLC alleges 'tortious interference with legitimate automated purchasing'. They're suing you for cancelling their robot's tickets.", "LEGAL NOTICE")],
     [C("Fight it in court", "spend('legal', 40000 * scale)", "media += 2", "fans += 1", result="The judge laughs out loud reading the complaint. You win.", default=True),
      C("Settle", "spend('legal', 25000 * scale)", result="You settle. The robot gets a refund.")]),
], cd=104)

CH('ch_rival_spy', [
    ('rsp_spy', 'The Spy', [sc('narration', "Your new social media intern keeps asking about upcoming bouts, contract figures and 'where the boss keeps his passwords'. Their previous job was at a rival promotion. They list it on LinkedIn.")],
     [C("Feed them fake information", "follow('rsp_payoff', 4)", "chaos += 1", result="You leak a fake main event: you vs. a grizzly bear. It goes straight to the rival.", bot=2),
      C("Fire them", "media += 1", result="They leave with a stapler. It was your favorite stapler.", default=True)]),
    ('rsp_payoff', 'The Bear Card', [sc('headline', "RIVAL PROMOTION ANNOUNCES 'MAN VS BEAR' SPECTACULAR, SEEMINGLY IN RESPONSE TO RUMOURED COMPETING EVENT; ANIMAL RIGHTS GROUPS AND BEARS ALIKE OUTRAGED")],
     [C("Laugh about it publicly", "fans += 3", "media += 2", result="The rival quietly cancels the bear. The bear's agent is furious.", default=True)]),
], cd=156)

CH('ch_merch_disaster', [
    ('md_order', 'The Merch Typo', [phone("The merch warehouse has 40,000 shirts for your next event. They all say '{promotion} FIGHT NIHGT'. It's too late to reprint.", "Merch vendor")],
     [C("Sell them anyway as 'limited edition'", "earn('merch', 40000 * scale)", "follow('md_cult', 6)", result="'NIHGT' becomes a thing. People yell it at events.", bot=2, default=True),
      C("Shred them and eat the cost", "spend('merch', 30000 * scale)", result="A very expensive bonfire.")]),
    ('md_cult', 'NIHGT', [sc('social', "'FIGHT NIHGT' is now a meme. Fans chant it. A rapper put it in a song. The shirts are selling for $400 online. You still have 2,000 in a warehouse.")],
     [C("Print 50,000 more", "earn('merch', 120000 * scale)", "fans += 2", result="Typo capitalism. Beautiful.", bot=2, default=True)]),
], cd=156)

CH('ch_pay_whistle', [
    ('pw_leak', 'The Pay Leak', [sc('headline', "LEAKED: {promotion}'s fighter pay figures posted online by an anonymous account. Fans and fighters furious: one headliner made less than the arena's popcorn concession.")],
     [C("Announce a pay raise across the board", "allFighters('morale', 6)", "fighters += 5", "spend('purses', 80000 * scale)", "media += 3", result="Expensive, popular, and it shuts up the internet for almost a week.", ethics=2),
      C("Find the leaker", "fighters -= 3", "follow('pw_hunt', 3)", result="You start a hunt. The roster notices.", bot=1),
      C("Say nothing", "fighters -= 2", "media -= 2", result="Silence is also a statement. A bad one.", default=True)]),
    ('pw_hunt', 'The Leaker Revealed', [sc('narration', "The leaker was... your own accountant, who thought the numbers were 'embarrassing for everyone'. She's not wrong. She also resigned via a 12-page letter, cc'ing the entire roster.")],
     [C("Hire her back with a raise", "fighters += 2", "media += 1", result="Respect. She audits you more aggressively than ever.", ethics=1),
      C("Sue her", "spend('legal', 30000 * scale)", "fighters -= 4", "media -= 3", result="The headlines are worse than the leak.", default=True)]),
], cd=104)

CH('ch_ppv_hack', [
    ('ph_crash', 'The Stream Crashes', [phone("Twenty minutes before the main event, the PPV stream crashes. 300,000 people are staring at a spinning wheel. The tech guy says 'it's the servers'. The servers say nothing.", "Broadcast tech")],
     [C("Offer everyone a free replay and refunds", "spend('refunds', 80000 * scale)", "fans += 3", "network -= 1", result="Expensive goodwill. The memes are kinder.", default=True, ethics=1),
      C("Blame hackers", "media -= 2", "follow('ph_truth', 4)", result="'Foreign hackers.' Nobody believes it. Least of all the hackers.", bot=1)]),
    ('ph_truth', 'It Was the Intern', [sc('headline', "REPORT: PPV OUTAGE CAUSED BY INTERN UNPLUGGING SERVER TO CHARGE PHONE")],
     [C("Give the intern a promotion (in title only)", "fans += 2", "media += 1", result="'Head of Phone Charging'. The intern has never been happier.", default=True)]),
], cd=156)

CH('ch_sponsor_scandal', [
    ('ss_bad', 'Sponsor Gone Bad', [sc('headline', "{sponsor.name} under investigation after its product was found to contain 'mostly sawdust and optimism'.")],
     [C("Drop them immediately", "dropSponsor(sponsor)", "media += 2", result="Clean break. The logo comes off the mat with a heat gun.", default=True, ethics=1),
      C("Stand by them", "sponsors -= 2", "media -= 3", "follow('ss_fallout', 4)", result="'We believe in sawdust.'", bot=1)]),
    ('ss_fallout', 'Sawdustgate', [sc('social', "Fans have started throwing sawdust into the cage at events. A fighter slipped on it. Sawdustgate is trending.")],
     [C("Drop them now", "dropSponsor(sponsor)", "media += 1", result="Too late to look principled, early enough to stop the sawdust.", default=True)]),
], roles={"sponsor": SP()}, cd=104)

CH('ch_venue_owner', [
    ('vo_offer', 'The Arena For Sale', [phone("The owner of a mid-sized arena wants out. He'll sell it to you for {$fee}. 'It's a great building. Mostly. There's a raccoon situation.'", "Arena owner Herb")],
     [C("Buy it", "spend('capital', vars.fee)", "unlockVenue('rodeo_pavilion')", "follow('vo_raccoon', 6)", result="You own an arena. You own a raccoon situation.", bot=2),
      C("Pass", result="He sells to a church. The church also has a raccoon situation.", default=True)]),
    ('vo_raccoon', 'The Raccoon Situation', [sc('fightnight', "A raccoon got into the cage during the prelims, took a fighter's mouthguard, and refused to leave. The crowd chanted its name (they named it 'Trash Panda Jones'). It's now the arena mascot.")],
     [C("Make it official", "fans += 3", "media += 2", result="Trash Panda Jones gets a jersey. And a rabies shot.", default=True, bot=1)]),
], vars={"fee": money(400, 900)}, cd=208, acts=[2, 3, 4])

CH('ch_streaming_war', [
    ('sw2_bid', 'The Streaming Bidding War', [phone("Two streaming services want your fights. One offers more money. The other offers 'more eyeballs'. Both have names that sound like a cough medicine.", "Your media agent")],
     [C("Take the money", "earn('broadcast', 300000 * scale)", "fans -= 2", "follow('sw2_result', 12)", result="Fans need a new subscription. Fans hate subscriptions.", bot=2),
      C("Take the eyeballs", "fans += 3", "network += 2", "follow('sw2_result', 12)", result="Less money, more people watching. The board frowns. The fans smile.", default=True)]),
    ('sw2_result', 'Streaming Report Card', [memo("The streaming deal report is in: subscribers up, revenue up, the app crashes during every main event and the 'skip intro' button skips the fights.", "MEMO: STREAMING REVIEW")],
     [C("Demand the app gets fixed", "network -= 1", "fans += 2", result="They fix it. Now 'skip intro' skips Juiced Butler. Fans riot.", default=True),
      C("Who cares, money's money", "patience += 2", "fans -= 2", result="The board cares about money. Money's money.")]),
], cond="act >= 2", cd=208)

CH('ch_press_ban', [
    ('pb_ban', 'Ban the Reporter?', [sc('social', "{reporter.name} broke your main event before you announced it. Again. {His} post got more attention than your announcement video.")],
     [C("Ban {reporter.name} from events", "ban(reporter)", "media -= 4", "follow('pb_backlash', 2)", result="Banned. Every other reporter writes about the ban.", bot=1),
      C("Invite {him} for a coffee instead", "media += 2", result="{He} brings a recorder. You both laugh. Then {he} leaks the coffee.", default=True, ethics=1)]),
    ('pb_backlash', 'The Backlash', [sc('headline', "REPORTERS STAGE WALKOUT AT {promotion} MEDIA DAY IN SOLIDARITY WITH BANNED COLLEAGUE; ONLY BRAILLE SONNEN REMAINS, 'BECAUSE NOBODY TOLD HIM'")],
     [C("Lift the ban", "unban(reporter)", "media += 3", result="Peace returns. Braille gets an exclusive for staying.", default=True, ethics=1),
      C("Double down", "media -= 4", "fans += 1", result="The internet is split. Braille Sonnen's exclusive is about a chair.")]),
], roles={"reporter": R("r.nemesis || r.rel < -10")}, cat='media', cd=104)

CH('ch_fight_island', [
    ('fi_pitch', 'Fight Island', [phone("A billionaire has offered his private island for a 'Fight Island' event. Mandatory quarantine, a cage on the beach, and a resort. He just wants a ringside seat and a fight against 'anyone, any size'.", "The billionaire's assistant")],
     [C("Do it", "unlockVenue('fight_island')", "fans += 3", "follow('fi_event', 8)", "earn('sponsors', 100000 * scale)", result="Passports, sunscreen and very confused fighters.", bot=2),
      C("Too weird", result="He takes it to a rival. Their fighters get sunburned. Good.", default=True)]),
    ('fi_event', 'Fight Island Night', [sc('fightnight', "Fight Island: the cage is on the sand, the crowd is 40 billionaires and a parrot, and a fighter got stung by a jellyfish during the walkout. Ratings are enormous.")],
     [C("Make it an annual event", "fans += 3", "network += 3", result="The billionaire still wants his fight. Nobody will take it. Somebody will eventually.", default=True, bot=2),
      C("One and done", "fighters += 1", result="Fighters thank you. The jellyfish don't.")]),
], cond="act >= 2", cd=208)

CH('ch_crypto_sponsor', [
    ('cs_offer', 'The Crypto Coin', [phone("A crypto company wants to sponsor everything: the cage, the belts, the ring card girls, and your bathroom. They'll pay entirely in their own coin, $CAGE, which launched yesterday.", "Crypto bro named Trent")],
     [C("Take it, cash out fast", "earn('sponsors', 200000 * scale)", "follow('cs_rug', 6)", result="You cash out 30% immediately. Trent is upset. Trent will be more upset soon.", bot=2),
      C("Take it, hold the coin", "follow('cs_rug', 6)", "setFlag('cage_coin', 1)", result="To the moon, apparently.", ethics=-1),
      C("No crypto", result="Trent says you're 'ngmi'. You don't know what that means.", default=True)]),
    ('cs_rug', 'The Rug Pull', [sc('headline', "$CAGE COIN DROPS 99.8% IN AN HOUR; CEO TRENT REPORTEDLY 'ON A BOAT, SOMEWHERE'")],
     [C("Quietly scrape the logos off", "media -= 1", "fans -= 1", result="The belts still say $CAGE on the back. Forever.", default=True),
      C("Publicly apologize to the fans", "media += 2", "fans += 1", "flag.cage_coin ? spend('losses', 100000 * scale) : meter('fans', 1)", result="An apology video. Sincere. Mostly.", ethics=1)]),
], cd=208)

CH('ch_tv_ratings_war', [
    ('tr_counter', 'Counter-Programming', [phone("A rival promotion has scheduled its biggest event the same night as yours. Same time. Same city. The local news is calling it 'Civil War'.", "Your head of marketing")],
     [C("Move your event", "fans -= 1", "network -= 1", result="You look scared. You aren't. Okay, you are.", default=True),
      C("Go head-to-head", "follow('tr_night', 3)", "fans += 2", result="Civil War it is.", bot=2)]),
    ('tr_night', 'Civil War Night', [sc('headline', "CIVIL WAR: ratings war between {promotion} and its rival ends with a decisive winner, decided largely by which event had the bigger knockout and the better hot dogs.")],
     [C("Throw a victory press conference", "fans += 2", "media += 2", result="You declare victory regardless of the numbers. The numbers are close. You declare harder.", default=True),
      C("Offer the rival a co-promotion", "network += 2", result="They decline, then call back an hour later.")]),
], cond="rivalsAlive > 0", cd=104)

CH('ch_sports_bar', [
    ('sb_deal', 'Sports Bar Chain', [phone("Hooterz wants exclusive rights to show your PPVs in its 600 locations. They'll pay well. They want a fighter at every grand opening. In person. Shirtless.", "Hooterz partnerships")],
     [C("Accept", "earn('broadcast', 80000 * scale)", "follow('sb_tour', 6)", result="600 locations. Shirtless appearances. The fighters are split.", bot=2),
      C("Decline", result="They sign with a rival. The rival's fighters develop a wing addiction.", default=True)]),
    ('sb_tour', 'The Wing Tour', [sc('social', "Your fighters have done 40 sports bar appearances in a month. Three are in the middle of weight cuts. One ate 140 wings on camera and is now 'the Wing King'.")],
     [C("Embrace the Wing King", "fans += 2", "fighters -= 1", result="He's sponsored now. His cardio is not.", default=True),
      C("Pull fighters in camp from appearances", "fighters += 2", "sponsors -= 1", result="Fighters thank you. Hooterz sends a sternly worded wing.", ethics=1)]),
], cd=104)

CH('ch_walkout_music', [
    ('wm_lawsuit', 'Walkout Song Lawsuit', [doc("CEASE AND DESIST: Representatives of {pop_musician} demand that {promotion} stop using their client's song for fighter walkouts. Damages sought: 'a lot'.", "LEGAL NOTICE")],
     [C("Pay the licensing fee ({$fee})", "spend('licensing', vars.fee)", result="Licensed. The fighter can walk out to it forever.", default=True),
      C("Commission a soundalike", "spend('music', vars.fee * 0.2)", "follow('wm_soundalike', 4)", result="A guy in a basement produces 'Song (Not That Song)'.", bot=2)]),
    ('wm_soundalike', 'The Soundalike Hits', [sc('social', "The soundalike walkout track has gone viral and is now charting higher than the original song. The original artist is furious and also asking for a remix.")],
     [C("Release it officially", "earn('licensing', 50000 * scale)", "fans += 2", result="You're a record label now, apparently.", default=True, bot=2)]),
], vars={"fee": money(30, 90)}, cd=156)

CH('ch_board_seat', [
    ('bs_ask', 'The Board Wants a Seat', [memo("The Board would like to place an 'observer' in your weekly meetings. He's 26, says 'synergy' a lot, and has never watched a fight.", "MEMO: GOVERNANCE")],
     [C("Accept the observer", "patience += 6", "follow('bs_observer', 6)", result="Chad from corporate has a laptop with a sticker that says 'DISRUPT'.", default=True),
      C("Refuse", "patience -= 6", result="The Board notes your 'lack of collaborative spirit'.", bot=1)]),
    ('bs_observer', 'Chad From Corporate', [sc('narration', "Chad has proposed: shorter rounds, a mid-fight halftime show, and an 'NFT belt'. He also asked if fighters can wear brand logos on their faces.")],
     [C("Shoot it all down politely", "patience -= 2", "fighters += 1", result="Chad takes notes. Chad reports back. Chad is relentless.", default=True),
      C("Let Chad try the halftime show once", "fans -= 3", "network += 2", "patience += 4", result="The halftime show is a DJ and a man in a nugget costume. Never again.", bot=1)]),
], cat='owner', cond="sold || act >= 3", cd=208)

CH('ch_charity_fight', [
    ('cf_offer', 'Charity Super Show', [phone("A children's hospital wants to partner on a charity card. All gate money goes to the hospital. Your fighters would fight for free. Some will grumble. Some will cry. All will be on TV.", "Hospital foundation")],
     [C("Do it", "fans += 3", "media += 4", "fighters -= 1", "follow('cf_night', 6)", result="You announce it. Your inbox fills with fighters volunteering. And three asking about the free part.", ethics=2),
      C("Make a donation instead", "spend('charity', 40000 * scale)", "media += 1", result="Generous. Quiet. Less fun.", default=True)]),
    ('cf_night', 'Charity Night', [sc('fightnight', "The charity card raises a record amount. A kid with a paper belt hands it to the main event winner. The winner gives it back. Lon Anik is audibly crying on the broadcast.")],
     [C("Make it annual", "fans += 3", "media += 3", "fighters += 2", result="The best night of the year, every year.", default=True, ethics=2)]),
], cd=208)
