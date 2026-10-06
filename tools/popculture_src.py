"""Pop-culture parody bank -> data/documents/popculture.json.

Each entry: real thing | parody name. Kinds are used by {pop_<kind>} placeholders
in commentary, news, social posts, fun facts and storylets (src/sim/popculture.ts).
Parodies are affectionate pun names only: nothing here asserts facts about real people.
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..')

BANK = {
    "movie": """
Rocky|Rocko
Rocky IV|Rocko IV: The Cold War Gets Colder
Creed|Greed
Raging Bull|Raging Bill
Fight Club|Fright Club
Million Dollar Baby|Million Dollar Gravy
Warrior|Worrier
The Wrestler|The Rassler
Bloodsport|Bloodspork
Kickboxer|Kickboxer 7: Kick Harder
Never Back Down|Never Back Down (Unless Asked Nicely)
Cinderella Man|Cinderella Mansplainer
The Fighter|The Lighter
Ip Man|Ip Mansion
Enter the Dragon|Enter the Wagon
Karate Kid|Karate Kidney
Cobra Kai|Cobra Pie
Gladiator|Gladiater
300|299 (One Called In Sick)
Top Gun|Top Bun
Top Gun: Maverick|Top Bun: Mayonnaise
John Wick|John Wicked
John Wick: Chapter 4|John Wicked: Chapter Forty
The Matrix|The Mattress
Fast & Furious|Fast & Curious
Fast X|Fast Eleventeen
Jurassic Park|Jurassic Parking Lot
Jaws|Jowls
Titanic|Titantic
Avatar|Avatartar Sauce
Avengers: Endgame|Avengers: Endgame Theory
Iron Man|Iron Mandatory Overtime
Captain America|Captain Amerigo
Thor|Sore
The Hulk|The Bulk
Spider-Man|Spider-Manager
Batman|Bathman
The Dark Knight|The Dark Late Night
Joker|Jokester
Superman|Super-Mansplain
Wonder Woman|Wander Woman
Aquaman|Aquamandatory
Deadpool|Deadpull
Black Panther|Black Pantry
Guardians of the Galaxy|Guardians of the Gas Station
Star Wars|Star Bores
The Empire Strikes Back|The Empire Strikes Back Taxes
Lord of the Rings|Lord of the Onion Rings
The Hobbit|The Habit
Harry Potter|Harry Pothead
Twilight|Twilate
The Hunger Games|The Hunger Pains
Barbie|Barbecue
Oppenheimer|Oppenheimer's Cousin Dale
Dune|Dunes Buggy
Mad Max: Fury Road|Mad Max: Furry Road
The Godfather|The Godfather-In-Law
Scarface|Scarfface
Goodfellas|Goodfellers
The Wolf of Wall Street|The Woof of Wall Street
Pulp Fiction|Pulp Friction
Kill Bill|Kill Phil
Inglourious Basterds|Inglorious Bastards Who Can't Spell
Django Unchained|Django Unchainsawed
Taxi Driver|Taxi Diver
Home Alone|Home Aloan
Die Hard|Die Medium
Rambo|Rambow
Terminator|Determinator
Predator|Pre-Date-Or
Commando|Commandough
Rush Hour|Rush Hour Traffic
Bad Boys|Bad Boyz II Men
Men in Black|Men in Slacks
Independence Day|Indecisive Day
Shrek|Shrekt
Toy Story|Toy Sorry
Finding Nemo|Finding Emo
The Lion King|The Lyin' King
Frozen|Frozen Burrito
Cars|Carbs
Kung Fu Panda|Kung Fu Pandemic
Space Jam|Space Ham
Grown Ups|Groan Ups
Step Brothers|Stepdad Brothers
Anchorman|Anchorbro
Talladega Nights|Taladega Nights: The Ballad of Ricky Boring
Superbad|Supermid
The Hangover|The Hungover
Mean Girls|Mean Gyms
Napoleon Dynamite|Napoleon Dynamight
Dodgeball|Dodgebrawl
Happy Gilmore|Happy Gill-More
Forrest Gump|Forrest Lump
Jackass|Jackassery
Borat|Bore-At
Saw|Seesaw
The Conjuring|The Conjugating
Get Out|Get Outta Here
Scream|Scream Cheese
Halloween|Hallow-wean
It|It (Dad's Garage)
Inception|Incepshun
Interstellar|Interstellar Tax Return
Gravity|Gravy-ty
The Martian|The Martini
Moneyball|Money Brawl
Remember the Titans|Remember the Titanics
The Blind Side|The Blind Sonnen
Friday Night Lights|Friday Night Fights
Happy Feet|Happy Defeat
Ratatouille|Rat-a-Tool-ey
Despicable Me|Despicable Meme
Minions|Minimum Wage Minions
Pirates of the Caribbean|Pirates of the Crab-Bean
Mission: Impossible|Mission: Improbable
Speed|Mild Speed
Point Break|Pointless Break
Road House|Road Mouse
Ready Player One|Ready Prayer One
The Social Network|The Social Notwork
Wall-E|Wall-Eee
Up|Down
""",
    "show": """
Breaking Bad|Breaking Bread
Better Call Saul|Better Call Paul
Game of Thrones|Game of Phones
House of the Dragon|House of the Wagon
The Sopranos|The Sopra-Nos
The Office|The Orifice
Parks and Recreation|Parks and Wreck-reation
Friends|Fiends
Seinfeld|Swinefeld
The Simpsons|The Simpletons
Family Guy|Family Gym Guy
South Park|South Parkour
Rick and Morty|Prick and Morty
Stranger Things|Stranger Thongs
The Walking Dead|The Walking Wed
Squid Game|Squib Game
Peaky Blinders|Peaky Blunders
Succession|Suck-cession
Ted Lasso|Ted Lasagna
The Last of Us|The Last of Us Ate the Snacks
The Bear|The Beer
Yellowstone|Yelling-stone
The Boys|The Bros
The Mandalorian|The Mandolin-ian
Wednesday|Wednesday Afternoon
Euphoria|Euphoric Diarrhea
Love Island|Glove Island
The Bachelor|The Batch-of-Lore
Survivor|Survivor: Bankruptcy Island
Big Brother|Big Bother
Keeping Up with the Kardashians|Keeping Up with the Card-Dashians
The Real Housewives|The Real Housewifebeaters' Lawyers
Jersey Shore|Jersey Snore
Duck Dynasty|Duck Dynasty: Revenge of the Ducks
Shark Tank|Shark Tankini
Kitchen Nightmares|Kitchen Nightsweats
Hell's Kitchen|Hell's Kitchen Sink
Love Is Blind|Love Is Braille
Too Hot to Handle|Too Hot to Handle Sauce
Cops|Copz
Jackass|Jack-asked
Ridiculousness|Ridicu-mess
SpongeBob SquarePants|SpongeBob SquatPants
Pokemon|Pokeyman
Dragon Ball Z|Dragon Brawl Z
Naruto|Nah-ruto
One Piece|One Pizza
Attack on Titan|Attack on Titan's Hamstrings
Jeopardy!|Jeopardy-ish!
Wheel of Fortune|Wheel of Misfortune
The Price Is Right|The Purse Is Wrong
Saturday Night Live|Saturday Night Lies
The Tonight Show|The Tonight-ish Show
Sesame Street|Sesame Beat
Mister Rogers' Neighborhood|Mister Rogan's Neighborhood
Seinfeld reruns|Swinefeld reruns
Law & Order|Law & Odor
CSI|C-S-Why
Grey's Anatomy|Grey's Anatomy Class
The Crown|The Crown Royal
Downton Abbey|Downtown Abbey
Top Gear|Top Gearbox
Planet Earth|Planet Girth
Dexter|Dexterity
Twin Peaks|Twin Peeks
The X-Files|The Ex-Files
Lost|Lost and Found
Prison Break|Prison Lunch Break
24|23 and a Half
Bluey|Blue-ey
Paw Patrol|Claw Patrol
Teenage Mutant Ninja Turtles|Teenage Mutant Ninja Hurdles
Power Rangers|Power Strangers
WWE Raw|WWE Raw Chicken
Monday Night Football|Monday Night Food Ball
""",
    "musician": """
Eminem|M&M (Peanut)
Drake|Drakeo the Snake
Kendrick Lamar|Kendrick Llama
Kanye West|Kanye Vest
Taylor Swift|Taylor Shift
Beyonce|Bey-Once-a-Week
Rihanna|Ri-Hannah Montana
Snoop Dogg|Snoop Hogg
Dr. Dre|Dr. Dreary
Ice Cube|Ice Cubed
50 Cent|50 Sense
Jay-Z|Jay-Zzz
Lil Wayne|Lil Wane
Travis Scott|Travis Scot-Free
Post Malone|Post Baloney
Bad Bunny|Bad Bunion
Ed Sheeran|Ed Shearing
Justin Bieber|Justin Beaver
Ariana Grande|Ariana Venti
Billie Eilish|Billy Eyelash
Lady Gaga|Lady Gag-Gag
Bruno Mars|Bruno Marsbar
The Weeknd|The Weakened
Doja Cat|Doja Catnap
Nicki Minaj|Nicki Menage
Cardi B|Cardio B
Megan Thee Stallion|Megan Thee Scallion
Lizzo|Fizzo
Harry Styles|Hairy Styles
Dua Lipa|Dua Liposuction
Olivia Rodrigo|Olivia Rodeo
SZA|S-Zzz-A
Future|Past
Metro Boomin|Metro Bloomin
21 Savage|21 Sandwich
Lil Uzi Vert|Lil Oozy Vert
Playboi Carti|Playboy Party
Tyler, the Creator|Tyler, the Crater
Mac Miller|Mac N Cheese Miller
Logic|Illogic
Pitbull|Pitbull Terrier
Flo Rida|Flo Rida Man
Akon|Akorn
T-Pain|T-Pane (Window)
Nelly|Nellie the Elephant
Usher|Usher (Ushers You To Your Seat)
Chris Brown|Chris Brownie
Shaggy|Saggy
Vanilla Ice|Vanilla Rice
MC Hammer|MC Hamster
Coolio|Coolio-er
Tupac|Tu-Pack (of Gum)
Biggie Smalls|Biggie Medium
Wu-Tang Clan|Woo-Tang Clam
Run-DMC|Run-DMV
Public Enemy|Public Frenemy
Metallica|Metal-Liquor
AC/DC|AC/DC Comics
Guns N' Roses|Buns N' Noses
Nirvana|Nervana
Foo Fighters|Foo Lighters
Red Hot Chili Peppers|Red Hot Chili Poppers
Linkin Park|Linkin Parking
Limp Bizkit|Limp Biscuit
Creed|Creed (the Band, Sadly)
Nickelback|Nickelback (Change Back)
Coldplay|Cold Play-Doh
Imagine Dragons|Imagine Wagons
Maroon 5|Maroon 6
The Rolling Stones|The Rolling Kidney Stones
The Beatles|The Beetles
Queen|Queen-Size Mattress
Elvis Presley|Elvis Pressly
Michael Jackson|Michael Jack-Son-of-a-Gun
Prince|Prince (Formerly Known As Princess)
Madonna|Madonnut
Britney Spears|Britney Smears
Celine Dion|Celine Dijon
Dolly Parton|Dolly Carton
Johnny Cash|Johnny Credit
Willie Nelson|Willie Nelsons
Garth Brooks|Garth Crooks
Morgan Wallen|Morgan Wailin'
Luke Combs|Luke Combovers
Kenny Chesney|Kenny Cheesy
Shania Twain|Shania Choo-Choo-Train
Daft Punk|Daft Funk
Skrillex|Skrill-Ex-Wife
Marshmello|Marsh-Jello
Calvin Harris|Calvin Hairless
David Guetta|David Getta-Snack
Avicii|A-Vicky
DJ Khaled|DJ Khaled (Another One)
Ice Spice|Ice Spice Rack
Sexyy Red|Sexy Bread
Kid Rock|Kid Rock Bottom
Bon Jovi|Bon Jovial
""",
    "celeb": """
Kim Kardashian|Kim Card-Dashian
Kylie Jenner|Kylie Jenga
Kris Jenner|Kris Jenga Sr.
Elon Musk|Elon Muskrat
Jeff Bezos|Jeff Bezoz
Mark Zuckerberg|Mark Zuckerbot
Bill Gates|Bill Gated-Community
Oprah Winfrey|Oprah Winfreeze
Ellen DeGeneres|Ellen De-Generous
Dwayne Johnson|Dwayne 'The Rocky Road' Johnson
Kevin Hart|Kevin Heart-Attack
Will Smith|Will Smithers
Jada Pinkett Smith|Jada Pinkett Smithers
Chris Rock|Chris Rocky Road
Tom Cruise|Tom Snooze
Brad Pitt|Brad Pitstop
Leonardo DiCaprio|Leonardo DiCappuccino
Johnny Depp|Johnny Deep
Keanu Reeves|Keanu Leaves
Ryan Reynolds|Ryan Reynolds Wrap
Ryan Gosling|Ryan Goslinging
Mark Wahlberg|Mark Wahlburger
Matthew McConaughey|Matthew McConaugh-hey-hey
Nicolas Cage|Nicolas Cage Match
Arnold Schwarzenegger|Arnold Schwarzen-ebay
Sylvester Stallone|Sylvester Stallion
Jason Statham|Jason Stat-Ham
Vin Diesel|Vin Unleaded
Jackie Chan|Jackie Chain
Bruce Lee|Bruce Leigh-Ann
Chuck Norris|Chuck Morris
Jean-Claude Van Damme|Jean-Claude Van Damn
Steven Seagal|Steven Seagull
Danny Trejo|Danny Taco-Trejo
Samuel L. Jackson|Samuel L. Jackson Five
Morgan Freeman|Morgan Freeman (Paid Version)
Denzel Washington|Denzel Washing-Machine
Tom Hanks|Tom Hanks-a-Lot
Jack Black|Jack Blackout
Adam Sandler|Adam Sandals
Pete Davidson|Pete Davidsun
Zendaya|Zen-Day-Off
Timothee Chalamet|Timothee Chalamelt
Margot Robbie|Margot Robbery
Jennifer Lopez|Jennifer Lo-Pez Dispenser
Ben Affleck|Ben Aff-Lack
Matt Damon|Matt Daymon
Gordon Ramsay|Gordon Ramsey Bolton
Guy Fieri|Guy Fiery
Martha Stewart|Martha Steward
Paris Hilton|Paris Hilton Garden Inn
Charlie Sheen|Charlie Sheen-Winning
Mike Tyson|Iron Mike Tysoff
Floyd Mayweather|Floyd Mayweather-Forecast
Muhammad Ali|Muhammad Al-Eh
Jake Paul|Jake Pall
Logan Paul|Logan Pall
Tom Brady|Tom Braid-y
Shaquille O'Neal|Shaquille O'Meal
Charles Barkley|Charles Bark-ley
Snooki|Snoozy
Gene Simmons|Gene Simmers
Steve Harvey|Steve Hardly
Jerry Springer|Jerry Spring-Roll
Dr. Phil|Dr. Fill
Judge Judy|Judge Moody
David Hasselhoff|David Hassle-hoff
Pamela Anderson|Pamela Andersnore
Hulk Hogan|Bulk Logan
Randy Savage|Randy Cabbage
Mr. T|Mr. Tea
Steve-O|Steve-Oh-No
Bear Grylls|Bear Grills
Steve Irwin|Steve Irwin-Win
Bob Ross|Bob Gloss
Danny DeVito|Danny DeBurrito
Owen Wilson|Owen Wow-son
Jim Carrey|Jim Scary
Will Ferrell|Will Feral
Seth Rogen|Seth Rogaine
Jonah Hill|Jonah Downhill
Shia LaBeouf|Shia LaBeef
Bill Murray|Bill Furry
Christopher Walken|Christopher Walkin'
Gary Busey|Gary Busy
Flavor Flav|Flavor Flab
Rick Ross|Rick Floss
Diddy|Diddly-Squat
""",
    "game": """
Fortnite|Forty-Nite
Minecraft|Mindcraft
Call of Duty|Call of Booty
Grand Theft Auto|Grand Theft Alpaca
GTA VI|GTA VI (Still Loading)
Elden Ring|Elder Ring Pop
Dark Souls|Dark Socks
League of Legends|League of Leg Days
World of Warcraft|World of Warcrafts and Hobbies
Roblox|Robblocks
Among Us|Among Ussy
Fall Guys|Fall Gals
Rocket League|Pocket League
FIFA|FIFU
Madden|Maddening
NBA 2K|NBA 2Kay
UFC 5|CageBox 5
Street Fighter|Treat Fighter
Mortal Kombat|Mortal Kombucha
Tekken|Tekkin' Naps
Super Smash Bros.|Super Smash Bros Before Hoes
Mario Kart|Mario Fart
Super Mario|Super Mario Batali
The Legend of Zelda|The Legend of Zelda's Cousin
Pokemon Go|Pokey Go
Tetris|Tetrish
Pac-Man|Pac-Manager
Sonic the Hedgehog|Sonic the Hedge Fund
Halo|Hello
Gears of War|Gears of Snore
God of War|God of Warts
The Last of Us|The Last of Ussy
Red Dead Redemption|Red Dead Repossession
Skyrim|Sky-Rimjob
Fallout|Fall Down
Cyberpunk 2077|Cyberpunk 2077 (Patch 3)
Animal Crossing|Animal Cross-Training
Candy Crush|Candy Crushed Windpipe
Angry Birds|Angry Nerds
Clash of Clans|Clash of Clams
Wii Sports|Wee Sports
Guitar Hero|Guitar Zero
Punch-Out!!|Punch-Out!! (Settled)
Duck Hunt|Duck Hunted
Counter-Strike|Counter-Striker Coach
Valorant|Valor-Can't
Apex Legends|Apex Legumes
Overwatch|Overwatched
Starcraft|Starcrafts and Hobbies
""",
    "athlete": """
LeBron James|LeBrawn James
Michael Jordan|Michael Jordan Almonds
Kobe Bryant|Kobe Beef Bryant
Stephen Curry|Stephen Curry Sauce
Kevin Durant|Kevin Durant-Durant
Shohei Ohtani|Shohei Oh-Tan-ny
Aaron Judge|Aaron Jury Duty
Cristiano Ronaldo|Cristiano Ronald-McDonald-o
Lionel Messi|Lionel Messy
Neymar|Neymar-ly Injured
Kylian Mbappe|Kylian M-Bap-Bap
Tiger Woods|Tiger Wood Chips
Serena Williams|Serena Will-I-Am
Usain Bolt|Usain Bolt-Cutter
Simone Biles|Simone Biles of Paperwork
Tom Brady|Tom Brady-Bunch
Patrick Mahomes|Patrick Ma-Homes
Travis Kelce|Travis Kelsey's Nine Lives
Aaron Rodgers|Aaron Dodgers
Wayne Gretzky|Wayne Gretz-Key Lime
Connor McDavid|Connor McDavid-Goliath
Lewis Hamilton|Lewis Hamilton Beach Blender
Max Verstappen|Max Verstappin'
Rafael Nadal|Rafael Nada
Roger Federer|Roger Fed-Ex
Novak Djokovic|Novak Joke-ovic
Tyson Fury|Tyson Furry
Anthony Joshua|Anthony Josh-Who-Ah
Canelo Alvarez|Cannoli Alvarez
Oleksandr Usyk|Oleksandr Use-It
Manny Pacquiao|Manny Pac-Man-Quiao
Oscar De La Hoya|Oscar De La Hoyoyo
Evander Holyfield|Evander Holey-Field
Deontay Wilder|Deontay Milder
Shannon Sharpe|Shannon Sharp-Cheddar
Skip Bayless|Skip Bayless-Than-Smart
Stephen A. Smith|Stephen A. Smithereens
Pat McAfee|Pat McAfee Coffee
Jalen Hurts|Jalen Hurts (So Bad)
Saquon Barkley|Saquon Barkley-Dog
Giannis Antetokounmpo|Giannis Anteater-kounmpo
Nikola Jokic|Nikola Joke-itch
Victor Wembanyama|Victor Wemba-yum-yum
Caitlin Clark|Caitlin Clerk
Ronda Rousey|Wanda Drowsy
Brock Lesnar|Brock Lessnar
The Undertaker|The Undercaterer
John Cena|John Cena (You Can't See Him Either)
Stone Cold Steve Austin|Stone Cold Steve Awesome
The Rock|The Rock (Ultra Thin)
Ric Flair|Rick Flare
Macho Man Randy Savage|Nacho Man Randy Cabbage
Andre the Giant|Andre the Medium
Roman Reigns|Roman Rains
CM Punk|CM Spunk
Rey Mysterio|Rey Mysterious Rash
Bret Hart|Bret Heart-Burn
Shawn Michaels|Shawn Michaels Arts and Crafts
""",
    "food": """
McDonald's|McDowell's
Burger King|Burglar King
Wendy's|Windy's
Taco Bell|Taco Bellyache
KFC|KFC (Kentucky Fried Cardio)
Chick-fil-A|Chick-fil-Eh
Popeyes|Pop-Eyes Swollen Shut
Subway|Subwaist
Chipotle|Chip-Hotel
Domino's|Dominoes
Pizza Hut|Pizza Hurt
Papa John's|Papa Jaw's
Little Caesars|Little Seizures
Dunkin'|Dunkin' Donuts on Your Head
Starbucks|Starbux
Krispy Kreme|Crispy Creamed
Waffle House|Waffle Brawlhouse
IHOP|IHOP-ed Over the Bar
Denny's|Denny's (2am Fight Club)
Applebee's|Applebees' Knees
Olive Garden|Olive Guarden
Red Lobster|Red Mobster
Outback Steakhouse|Outback Steakhouse Rules
Texas Roadhouse|Texas Roundhouse
Buffalo Wild Wings|Buffalo Wild Swings
Hooters|Hooters (Owls, Allegedly)
Cheesecake Factory|Cheesecake Fracture-y
Five Guys|Five Guys One Burger
In-N-Out|Win-N-Out
Shake Shack|Shake Smack
White Castle|White Hassle
Arby's|Arby's (We Have the Meats)
Sonic|Sonic Boom
Panda Express|Panda Excess
P.F. Chang's|P.F. Changs (The Subreddit)
Golden Corral|Golden Corral of Shame
Costco|Cost-Slow
Walmart|Wall-Mart
Target|Tar-Jay
Cheetos|Cheaters
Doritos|Dorito-Do-Rights
Pringles|Pringle Bells
Oreo|Ore-No
Twinkies|Twinkie Toes
Hot Pockets|Hot Pockets (Burned)
Lunchables|Punchables
Kraft Mac & Cheese|Craft Mac & Cheese
Spam|Spam (The Email)
Hot Cheetos|Hot Cheaters
Takis|Ta-Keys
Red Bull|Red Bullsh*t
Monster Energy|Mobster Energy
Prime Hydration|Prime Hydration (Not Primed)
Gatorade|Gator-Aid
Mountain Dew|Mountain Don't
Four Loko|Four Loco Parentis
White Claw|White Claw Machine
Bud Light|Bud Slight
Coors Light|Coors Lite Beer Lite
Jack Daniel's|Jack Daniels' Cousin Tim
Fireball|Fireballs
Ensure|Ensure (Grandma's)
Ozempic|Oz-Empty-ic
Ghost Energy|Ghosted Energy
Celsius|Fahrenheit
Muscle Milk|Muscle Mulk
""",
    "app": """
TikTok|TikTak
Instagram|Instagrump
Twitter|Twatter
X|Ex
Facebook|Faceplant
Snapchat|Snapped-Chat
YouTube|YouTubes (Plural)
Twitch|Twitchy
Kick|Kick (the Streaming One)
Reddit|Redd-it
Discord|Dis-Chord
OnlyFans|OnlyFighters
Tinder|Tender
Bumble|Bumble Bee Tuna
Hinge|Unhinged
Grindr|Grinder
LinkedIn|LinkedOut
Venmo|Venom-o
Cash App|Cash Nap
PayPal|PayPal-sy
Uber|Uber-Rated
DoorDash|DoorDashed Dreams
Uber Eats|Uber Eats Your Paycheck
Netflix|Netflicks (In the Groin)
Hulu|Hula
Disney+|Disney Minus
Spotify|Spot-If-Fy
Apple Music|Crabapple Music
Amazon|Amazin'
Google|Goggles
ChatGPT|ChatG-Petty
Siri|Siri-ously
Alexa|Alexa, Play Despacito
Zoom|Vroom
Robinhood|Robbin'-Hood
Coinbase|Coin-Debase
Bitcoin|Bit-Con
Dogecoin|Doge-Con
Crypto.com|Crypto.con
NFT|NF-Tea
Duolingo|Duo-Lingo (Owl Threats)
Pokemon Go|Poke-Go-Away
Waze|Waze (Wrong Way)
Yelp|Yelp! (Help!)
Fitbit|Fat-Bit
Peloton|Pelo-Done
MyFitnessPal|MyFitnessEnemy
Strava|Strava-ganza
Ring Doorbell|Ring Doorbrawl
Tesla|Tes-Lol
""",
    "streamer": """
MrBeast|MrBeef
xQc|xQueso
Kai Cenat|Kai Ce-NAP
IShowSpeed|IShowSlow
Adin Ross|Adin Gross
Pokimane|Poki-Mayonnaise
Ninja|Ninja Turtle
Shroud|Shroud-of-Turin
TimTheTatman|TimTheTaterTot
DrDisrespect|DrDisinfect
Hasan Piker|Hasan Pickles
Ludwig|Ludwig van Beefoven
KSI|K-S-Why
Andrew Tate|Andrew Taint
Bryce Hall|Bryce Hall Pass
Charli D'Amelio|Charli D'Ameliorate
Addison Rae|Addison Rash
David Dobrik|David Doo-Brick
PewDiePie|PewDiePie Crust
Markiplier|Mark-Multiplier
Jacksepticeye|Jack-Septic-Tank
Dream|Daydream
Corpse Husband|Corpse Husbandry
Valkyrae|Valky-Hooray
Sneako|Sneak-O-Pete
Fresh & Fit|Flesh & Fat
Hasbulla|Hasbulla-Bulla
Bradley Martyn|Bradley Martini
Liver King|Liver Prince (Raw)
Joe Rogan Experience|The Joe Brogan Experience
Theo Von|Theo Vaughn-Shaped
Barstool|Barstool (Wobbly)
Dave Portnoy|Dave Porknoy
Mike Majlak|Mike Major-Lack
Bryce Hall|Bryce Hall Monitor
Faze Rug|Faze Rug Burn
Logan Paul's Prime|Logan Pall's Primed
Unus Annus|Unus Anus
Mr. Beast Burger|MrBeef Burger
""",
    "meme": """
Rickroll|Rick-rolled-up
Distracted Boyfriend|Distracted Boyfriend (Weight Cut Edition)
This Is Fine|This Is Fine (Arena On Fire)
Ok Boomer|Ok Boomerang
Big Chungus|Big Chungus Heavyweight
Doge|Doge (Much Wow, Very KO)
Grumpy Cat|Grumpy Cat (Post-Fight)
Sad Keanu|Sad Keanu Leaves
Harambe|Harambe (Dicks Out, Respectfully)
Florida Man|Florida Man (Fighting Out Of)
Karen|Karen (Wants to See the Commission)
Chad|Chad (Thundercock)
Gigachad|Gigachad (Heavyweight)
Skibidi Toilet|Skibidi Toilet (Walkout Song)
Rizz|Rizz (Unspoken)
Sigma|Sigma Grindset
Mewing|Mewing (Jawline Gains)
Gyatt|Gyatt Damn
Ohio|Only in Ohio
NPC|NPC (Non-Punching Character)
Delulu|Delulu Is the Solulu
Main Character Energy|Main Event Energy
Touch Grass|Touch Mat
It's Over 9000|It's Over 9000 (Purse, in Cents)
Leeroy Jenkins|Leeroy Jenkins (Wrestling Coach)
Nyan Cat|Nyan Cat Walkout
Gangnam Style|Gangnam Style (Takedown)
Ice Bucket Challenge|Ice Bath Challenge
Tide Pod Challenge|Tide Pod Diet
Planking|Planking (Sprawl Drill)
Dab|The Dab (Celebration Penalty)
Floss Dance|Floss Dance (Before the Fight)
Griddy|The Griddy (After the Fight)
Hawk Tuah|Hawk Tuah (Spit Bucket)
Brat Summer|Brat Summer Camp
Roman Empire|Roman Empire (Thinking About Rocko IV)
Girl Dinner|Fighter Dinner (Rice Cake)
Chill Guy|Chill Guy (Before the Weigh-In)
Demure|Very Demure, Very Mindful (Ground and Pound)
""",
    "car": """
Lamborghini|Lamb-Bor-Ghini
Ferrari|Fur-ari
Rolls-Royce|Rolls-Roids
Bentley|Bent-Lee
Bugatti|Bug-Hatti
McLaren|McLaren-Not-McLovin
Porsche|Porch
Tesla Cybertruck|Cybertruck (Panel Gaps)
Hummer|Hummer (Fuel Bill)
Ford F-150|Ford F-150 Liens
Dodge Charger|Dodge Charger (Charges Pending)
Honda Civic|Honda Civic Duty
Toyota Prius|Toyota Pious
Kia Soul|Kia Soul (Lost It)
Smart Car|Dumb Car
Jeep Wrangler|Jeep Wrangler of Wrestlers
Mercedes G-Wagon|Mercedes G-Wagon-Wheel
Range Rover|Range Rover (Repo'd)
Chevy Impala|Chevy Impaled
Nissan Altima|Nissan Ultimatum
""",
    "brand": """
Nike|Nikey
Adidas|Adidaze
Under Armour|Under Armpit
Gucci|Goochi
Louis Vuitton|Louis Vuitt-Off
Supreme|Sub-Preme
Versace|Ver-Sauce
Balenciaga|Balencia-Gah
Crocs|Crocks
Yeezy|Queasy
Apple|Crabapple
Samsung|Samslung
PlayStation|PlayStationary
Xbox|X-Bocks
Rolex|Ro-Lacks
Hermes|Her-Mess
Lululemon|Lulu-Lemon-Squeezy
Gymshark|Gym-Sharknado
Gold's Gym|Gold-Teeth Gym
Planet Fitness|Planet Fitness (Lunk Alarm)
CrossFit|Cross-Fitting Room
Peloton|Pelo-Toast
Oakley|Oak-Lee
Ray-Ban|Ray-Banned
Jordan Brand|Jordan Almond Brand
Victoria's Secret|Victoria's Not-So-Secret
Calvin Klein|Calvin Klean
Tommy Hilfiger|Tommy Hill-Fighter
Ralph Lauren|Ralph Lauren Bacall
Patagonia|Patagonia-ish
""",
}


def main():
    out = {}
    total = 0
    for kind, block in BANK.items():
        rows = []
        for line in block.strip().splitlines():
            if '|' not in line:
                continue
            real, parody = [x.strip() for x in line.split('|', 1)]
            rows.append({"real": real, "parody": parody})
        out[kind] = rows
        total += len(rows)
    p = os.path.join(ROOT, 'data', 'documents', 'popculture.json')
    json.dump(out, open(p, 'w'), indent=1, ensure_ascii=False)
    print(f"wrote {p}: {total} parodies in {len(out)} kinds")


if __name__ == '__main__':
    main()
