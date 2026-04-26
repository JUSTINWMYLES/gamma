I did a full play through and found a bunch of bugs. I need you to go through and fix all of them and summarize what was done.

## System

- When the player icon gets more complex (more drawings), it does not save it. This goes for both the player icon in the lobby and for the games that have a common implementation for drawing characters
- Players give consent for audio and motion when joining a lobby, but it seems that it is forgotten sometimes as I'll start playing a game and then be prompted for consent again
- Color schemes are perfect for dark mode across the system, but for light mode there are lots of issues. Often in the instructions pages and in the actual games themselves
- Sometimes players will tie, but there will still be a first and second place trophy awarded, fix that so that in the event of ties they get the same positioning
- The platform sometimes allows for up to 20 players in a lobby. I need you to ensure that on the TV that everywhere there is a list of players that it is all visible on the screen without scrolling or zooming in. Figure out a consistent safe mechanism
- THe button to leave the room is good, the only issue is that the arrow part is too low, it needs to be centered

## Color match

- currently the game uses red, yellow, blue, white and black color bars. The problem I encountered was that a more neon green color was not achievable. I need you to review and identify why all colors cannot be achieved and determine a path forward that enables matching all colors. 

## Wanted ad

- The room code cannot be seen with the dark background, adjust the color of the text for this on the tv
- The countdown timer text color is dark on dark on the TV, this needs to be fixed throughout the game
- The highlight of the players names is dark on the dark background and cannot be seen on the TV, fix that so its a proper color that can be seen. This is specifically for light mode the issue is happening, dark mode is fine. Because the background of the game is dark, the game default just needs to be dark mode for the TV
- Increase the view time of each poster by 5 seconds
- When players go to vote, the entire card is shown which is good, but players cannot scroll properly as they have to use the tiny side to scroll. Fix it so that players can scroll from anywhere on the screen. Additionally, I can tell that the cards are not centered, they are to the left side preffered, fix that
- Make the icon portion of the drawing a bit smaller on the phones, it does not fit properly within the game card on mobile devices. There is a small box behind the circle for the player drawing, that does not need to be there
- WHen players are voting, the cards are displayed on the tv all at the same time, dont do this as they cannot all fit on the display when theres lots of players

## Audio Overlay

- There is game music but it only plays during the instructions phase but not during the the part where players are actually selecting gifs. I still want it to stop once it reaches the part where players record, but up until that I want it to be playing music
- This is one of the games where consent to use the microphone is asked again even though it was already granted
- Sometimes when players make submissions they do not register properly for the recordings. Fix any issue with this so that the game state is updated correctly

## News broadcast

- The music plays during the instructions phase but stops right after. I want the music to play right up until the news broadcasts actually start for the presentations phase
- The vote winners at the end only show on the phone and not on the TV. I want the winners to show on both the phone and the TV, but I want the TV to have a good fun presentation of the winners
- When searching for a gif, the search button seems to be not properly aligned and is off the side of the screen on mobile devices
- Increase the gif search part to 2 minutes
- Increase the logo design portion to 2 minutes
- When the gif results appear it is pretty slow as I think its trying to fetch too many results. It also is showing the title of the gifs
- In light mode there is a lot of white writing that is hard to see, fix that
- When submitting a headline, there is an option to `update headline` I don't want that, I want the submission to be final
- Players create a news company logo but it does not appear in the presentation stage. Update it so that there is some inclusion of the logo that they just made

## Medical story

- There are issues with light mode in this game, fix the light mode text color on background color so that it is visible. Dark mode is good as it is
- Music doesnt carry into the next round sometimes, ensure that subsequent rounds play music
- The left sidebar is down and to the right of the room code. Make it so that it is left aligned and goes all the way up. If the room code needs to be different colors for the background then change it so that it works properly

## S-tier

- When in light mode there is a lot of dark on dark text during the reveal and throughout the game, fix the color issues for light mode. Dark mode is fine.