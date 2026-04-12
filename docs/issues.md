Implement and fix all of the following comments. Don't stop until you are done. Ensure that all local tests succeed once complete.

## System Wide

- On the TV, always display the room code in the corner as smaller text. This is so that if someone accidentally drops mid game, they can quickly find the room code and rejoin
- Give players up to 1 minute to join back into the game mid game if they are disconnected
- Introduce a practice round game config option

## Player Icon 

- I want the icon to be much more customizable. I don't want it to just be an emoji, rather I would like it to be a full interactive designer where players are given a circle where they can draw and write text and use emojis
- I want the player icons to be used in all games for the leaderboards and scores

## Marketplace

- For the message comment game mode set the total time to submit a message at 3 minutes and make that fixed. Remove the configurable amount
- When a players ad is displayed then the users comment is then displayed after, make the ad itself show for 5 seconds first, then the players comment show for 10 seconds alongside it afterwards
- When players go to vote on the funniest one, bundle both the message and the add together so players know which one they liked the most. 

## Camp Fire

- Right now players have to press a button each time to enable microphone and the motion detection. This consent should be given at the very start when a player joins the game lobby, never within a game. Same thing should happen for any possible other feedback mechanisms that might be used. If a player refused consent, provide them with a button to provide consent, but if they don't consent then they dont get to properly play the game

## Tap Speed

- I saw a scenario where a player tapped more than the other, but they lost the game and had a score of -1. Review the code and fix this bug

## Medical game

- Throughout the game as each phase is entered, display the previous phase result. For example once the patient complaint phase is done, whichever one is selected should show on the TV in a box to the left showing what was selected. From there once the diagnosis is complete, display that as the next box on the TV. Ensure that this is always displayed on the tv in some manner until the game is over
- Right now when the game finishes, it provides a summary, I want that summary to show first the patient complaint in a box for 5 seconds, then the next one for 5 seconds, then the next for 5 seconds, showing all of them on the screen popping up

### Character Voting

- When voting, the players names do not get highlighted. Also, if a player votes for one for the doctor role, that name should be grayed out for the other 2 roles
- Based on who gets voted in for each role, the following will happen:
  - Patient - Gets double vote count for the patient complaint phase
  - Nurse - Gets double vote count for the diagnosis phase
  - doctor - Gets double vote count for the catchphrase phase

### Patient complaint

- The 3D model is not showing as available on the kubernetes deployment but it is showing in make dev
- The 3D model in make dev isn't centered. I can barely see the top corner of the models head. I need it to be centered, I also need to be able to view the character from top to bottom, figure out how to allow players to drag and select

### Diagnosis

- Remove the body part selection as this is already handled by the first patient complaint section
- Introduce a new section that shows funny "tests" that have been ran. Players can select up to 3 but it is not mandatory to select one. Use the following as a baseline and come up with more funny ones:
  - Gave it a close look
  - Did a long sniff test
  - Shook it
  - poked it

### Catchphrase

- Come up with a sentence that leaves the prompt more open ended. For example "Thats why they call me ___", then provide some examples of what could be populated on the screen

## Color Match

- I need you to ensure that the sliders work properly and allow all colors to be achieve. At the moment when all my sliders are off at the start, then I move any one of them over, the entire view just shows the one color no matter how much I move it over. I feel like this might be inhibiting players abilities to achieve certain colors. If I am wrong let me know

## Audio Overlay

- Give 2 modes, one mode where players submit gifs and they are randomized, another mode where players submit gifs then record their own
- There needs to be more time in between activities and more warning before a players turn starts for the recording phase
- When a players turn to record comes up it automatically starts recording. Change this so that there is a button to press and hold to record, so once they let go the recording stops. Give them the chance to re-record as many times as they want in their 60 second turn.
- Inform the player that they need to keep the recording to under 10 seconds, then limit the recording they take to being a max of 10 seconds
- The gifs have some text at the bottom when searching, I don't want that text to show, make it just the gifs
- When playing the gif with the audio recording, show an introduction first showing the gif for 5 seconds without the audio, then begin the audio for the duration of the players recording (up to 10 seconds). Once the audio finishes, wait 5 seconds before beginning the introduction of the next player

## Escape maze

- I want to separate the 2 game modes where players can navigate themselves vs. where teams of 4 have different roles for direction
- For the mode where teams of four have to navigate, I noticed that the visual map itself does not reflect the actual map that is being enforced behind the scenes
- For normal mode, when more than one round is played, I can see that the visual map and the map that are enforced in the backend are different. This causes the second round to be unplayable because the course isn't actually displaying properly.
- I need courses to be able to be randomly generated each round following these strict rules:
  - They must adhere to the current map size
  - they must offer more than 1 path for getting to the end
  - Any other logical rules for keeping the map fun but making it still challenging


## Don't get caught

- The bots quite often get stuck against walls or start glitching. Make them so much smarter and better at navigating the arena. Use logic to have them avoid walking right into walls and have them decide between turning left or right.

# New issues now

Ok there are now some new issues to address. Review all the items in this list and provide fixes. Do not stop no matter what until you have fixed everything. Don't accidentally pause, I need you to work completely uninterrupted. Problems:

- The room code sits in the same corner as the light mode dark mode button, move it to the top left corner to display the room code. Ensure that all games on the left side allow space for the room code in the top left corner to display on the TV only
- On the lobby screen view, prevent double taps on mobile devices from zooming in
- For the drawing circle, the background color isn't working. Also you can get rid of the text portion. The brush can be the full left to right width similar to the background now that the text portion is gone. The undo buttons don't have to be separate, it can be one button to undo the recent change whether its an emoji or a draw
- The campfire game still has buttons as alternate methods to blowing and shaking. I don't want those buttons to be there at all
- For paint match don't immediately tell the player their score, let the score be revealed once all players are done. I have to scroll a little bit up and down to view the whole screen, make the box for "your mix" a bit smaller so that I don't have to scroll up and down
- The button to leave is a bit off, the arrow needs to shift up a bit more to be centered. For the host user ONLY, when they click on the leave button, give them both options to leave, and another option to end the game and exit back to the lobby (this should move all players in that room back to the lobby)
- When a player selects the same name as someone else in the join room they get the following error message `The name "asd" is already taken in this lobby. Returning to start...`. If they pick the same name as someone, don't force them back to the lobby, just give a small message saying that the name is already taken and leave them on the same page to submit under another name
- In the medical game I see the following: 
  - The voting for assigning roles still has issues, the boxes with the players names does not highlight still when pressed
  - Previous winners displays on each players device, I don't want it on the devices, I want it on the tv only
  - `Waiting for this phase.` is always shown on the TV for each phase, it never updates. 
  - The 3D model and the body parts are offset, the model is lower than the actual selection boxes
  - The 3D model is still way off to the side. Figure out how to center it and zoom it out a lot more
  - The end when the TV is supposed to give the summary of each event as a "round recap", it just shows as loading the whole time
  - For the doctors catchphrase, when the submit button is pressed nothing happens
  - Once the players vote after each stage, show a page that says "The results are in..." and show that page for 5 seconds before revealing the winner. Then show the winning one for 10 seconds before moving to the next round
  - When the players are assigned their roles, make sure that it is very clear that they will receive double votes for the associated round
- When a player leaves the lobby voluntarily, they are shown a message that says `Disconnected from server`. I don't want that message to show as the user doesnt care
- In don't get caught, make it so that guards always start as close to the center as they can be, and the players start as far away from the center as they can be. Also introduce a 5th guard. Sometimes the guards go back and forth from one end to the other a lot and then only turn when they reach a wall, fix that so that they sometimes will turn to the side if possible even around the middle of the screen
