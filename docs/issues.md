## Starting page

- Add in a placeholder to point to github as a small icon on the starting screen somewhere along the bottom
- If it can be subtle, add some kind of `consider donating` thing eventually would link to a github donations 

## Lobby

- When the users are in the lobby they are able to see all the games that exist and scroll through, but as soon as a user selects a game, they lose the ability to scroll around, I want to keep the banner that says a game has been picked, but I want users to still be able to scroll through and look for the games
- When I scroll through games on my phone, some of the cards will move as if I selected it, but it just starts to get annoying when it thinks its being clicked on when I am just scrolling

## Game cards

- Some game cards have a small gap blank space at the bottom of the card. It's showing for different cards on different devices
- In the file additional.html I have some sample game cards for a few games where instead of showing an emoji I show dynamic html, can you make similar style cards for each game that exists
  - Use those game cards for the card view
  - The three samples that I have, please fix `Odd One Out` so that it doesnt have the word `WHO?` showing randomly
  - Please update Evil laugh overlay card so it matches the new name for the game that I define further down in this prompt. Get rid of the left 2 phones and just put the third phone in the middle
  - Adjust the alignment of the Loweball Marketplace so that the adds are a bit lower and get rid of some of the weird dynamic elements. Also don't call it `YardSale`, just remove that text. Make it look more like the listings that are in the actual game
  - Make sure they all support light and dark mode
- I want to implement the short summary view for the cards. Basically, when the user clicks on one of the game cards it takes them to a page that has some game details and info. I want the user to easily be able to navigate back to the lobby. I want this page to have the game title and descritpiton and the tag, some info about the expected playtime (which could be metadata required for each game), and I want you to leave a placeholder for me to upload an image/video/gif of the actual gameplace

## Hot Potato

- The implementation is a bit different from what I want
- When the game starts and one device is selected to be hot potato, that device will be the only device at play for the duration of that round. 
- The device will have the potato and indicate the next person that they have to pass it to
- Once they physically pass their phone to the next person, that next person will press the button to say they received it, then the next person to pass it to will appear on the phone and tv screens, and they will hand the phone to the next person physically
- The voting will actually determine who should have lost the points, this is because at the time of play the person may pass the phone, but the next person may not press the button and just wait (which would be unfair), so the users will decide who actually lost that round

## Marketplace

- So it's really close, one main change, when going through the listings and the comments, the listings have just the title and short description. I want all of the listing detail similar to when the user is scrolling through the items
- Make it just a bit longer showing each users listing and response, I just want people to be able to watch it
- For the bidding version of the game, I want you to assign characteristics to the item that is shown that directly impact the actual value of the reserve price. Right now hardcoded values is too simple, I would rather have some indicators that influence the price and allow users to try and legitimately guess the price
- I like the items that you created. Create me 5100 more items that follow the same concept. Take as long as you need for this

## Sound replication

- At the moment I can make any sound and it will give me a score about 60%. Can you improve the analytics?
- I also want to be able to see the actual amplitude of the song vs. the amplitude of the user audio
- Propose a solution that accounts for delay in the users audio, for example the main parts of the audio at the start may not line up with the desired sound. If the user needs to drag shift it over themselves then make that an option if needed

## Audio Overlay (renamed from Evil Laugh Overlay)

- I want to revamp this game. I want a random user to be selected, that random user will pick a category and the options will include but not be limited to:
  - animals
  - evil laughs
  - vehicles
  - any
  - yells
  - etc.
- Users then will select gifs that try to match with the category
- The rest of the game will remain as is, with the only difference being that users try to follow the defined category
- Rename as much as you need to across the registry and docs and files to align with this new game
- Can call it audio overlay maybe?

## Don't get caught

- Add an extra bot at the start
- Make the bots move faster
- make the bots not get stuck running into walls

## Player Join

- From the starting page once you click on `player` it takes you to the player screen where you pick between Join and create a room. That page still shows the old `gamma` text and not the logo that I have. Update that
- The same thing with the wrong logo shows on a couple different pages like the join room as well. Make sure its all uniform
- I want to allow the users to customize a bit of their character/icon. Please add in a stage where users are given a circle and they can put in text, drawings, and emojis into this shape

## Instructions Page

- I want to revamp the instructions set
- I want you to propose a mechanism where the instructions get displayed across the screen one major section at a time with nice fun large text that can be different colors and fonts and backgrounds for each game
- Ideally I want this to be compatible in the future to let me add in voice to read out the games instructions, but for now I just want to be able to break up the text into almost different slides, where each of them have fun transitions in and out

## Brackets

- Across a lot of games I allow for a wide range of players. I want to ensure that for large groups the playtime doesnt get too excessive, and for small groups the play time isnt too short.
- I want you to propose a bracketing system where for 1, 2, 3, 4, 8, 12, and 20 players, different styles of brackets are made
- This could be brackets of a couple 1v1 matches, or brackets where up to 4 players compete against each other at a time. Think of something logical and still fun
- Implement this bracket system for the games that seem to fit this