# Issues part 1

The following is a full detailed description of a bunch of issues and bugs that go across the system. I need you to fix all of these and ensure that everything still plays and builds the same. Make any necessary tests to validate all of these

## General

- The icon drawing is close. One issue is that the drawn pencil size doesn’t actually reflect on the real drawing. Even selecting a small pen creates a really large line
- The icon that contains the drawings from the players can be a bit bigger, it’s really small right now
- I no longer want the shelf or list view, I want only the cards 
- Going through the room setting selections, the buttons should not be as transparent, they can also be larger, they are small right now
- The feedback for the buttons when selecting the rooms is not very good, it needs to make it more clear once I’ve clicked one
- For the game cards, even if a game is not permitted for a given session (maybe they have too few players) I want to allow the player to click on the small information icon to learn more about the game
- When a game finishes, there is a button on the tv that says play again. This button cannot be pressed and should not be there at all
- When giving consent for motion control and microphone, there is one issue. Consent is given, then my devices show that the game is actively listening. This is not true and can scare people off if they don’t want to always think they are being listened to. Fix this so that it only shows that when the game is actually using the microphone
- From a code standpoint, I want the game instructions to be stored alongside the game code. I also want the instructions to be able to be different depending on the game mode within a single game. Use a json map for this to define the different game modes

## Audio overlay 

- The music stops after the instructions, it needs to keep playing. 
- Once a player selects the category, there is no feedback immediately, it pauses for a few seconds still displaying the categories and is weird for the player that selected the category. It needs to make it clear that the user selected a category and that it is done that step

## S-Tier game

- I need you to make the presentation portion a lot better 
- Do research to see what traditional images of s tier rankings look like
- I want you to go one at a time from lowest to highest showing which ones ended up in which categories allowing for 5 seconds between displaying each one

## grid tap colours

- the second round does not work at all, one phone shows a color but then doesn’t allow you to tap it and nothing shows on the tv 
- Once a players round ends, the tv should show that the round is done on the tv, right now it just waits until the next players turn. 
- The display needs to allow room in the top left corner for the room code

## wanted ad

- when players are creating the poster content, it populates the poster with some text on the phone but the text is far too large for the mobile display
- When the countdown gets to below 10 it still shows the 1 stuck in the background for some reason fixed
- It seems like the poster is not actually centered on the display
- Include a step at the beginning to define what your character is, then the characters are mixed in a pool and players will write the wanted ad based on that character. Allow players 2 minutes to come up with:
  - A name for the character
  - A drawing (similar to the icon)
  - A short description of the character
-  When displaying the posters in the tv, the poster does not fit within the display at all and is off to the side. It needs to be centered and needs to not be beyond the bounds of the display without scrolling. 
-  On the posters there is a little box that says audio placeholder. That needs to go away. 
-  I want to allow the bounty to be not just a dollar value, but whatever words the user wants  
- Increase the time create the poster up to 2 full minutes

## Medical game

- when going to submit the catchphrase, I receive an error message saying “times up! Submission window has closed” and the process on the side shows waiting for this phase
- when assigning roles, on the tv the font colors for the patient doctor and nurse are hard to see with the white background

# Issues part 2

- The game lobby settings buttons are not nice now, they are dark. Can you make them exactly like the blocks on the very first landing page of the game, where its a white solid background for light mode, and a dark solid background for dark mode
- In the wanted ad, there are some display elements that are off the main tv screen. I need to ensure that my requirement for the tv to fit all elements without scrolling is maintained throughout all games. When voting, I need to ensure that the user selects a button to submit vote, otherwise they might accidentally select the wrong one
- in the s-tier game, the color scheme has dark colors on dark backgrounds, fix that. Also some of the display elements when the reveal is happening, the top right reveal items are shifting items on the page down so I can't see them anymore
- When trying to join, if a device cannot actually grant consent (when local hosting on my network without TLS), I cannot seem to skip the consent, the popup from the app remains on the screen
- In the medical story game when I go to submit I still get the message `Time's up! Submission window has closed.` for the doctors catchphrase. I need that fixed. Also the music does not repeat once it finishes, I need that to work. There is some text in the top left corner that is too high as well that needs to be below the room code
- You can remove the emojis entirely from the drawing components for the icon and for the wanted ad game, it is just too much extra and I don't need it
- The music for the audio overlay game is better, but I need the music to completely stop once the players reach the recording part as the music will end up in the background of players recordings
- For grid tap colors the same issue is still there, the second round does not work and the game cannot be played. Still nothing appears on the tv and the first phone lights up a color but as a user you cannot tap on it