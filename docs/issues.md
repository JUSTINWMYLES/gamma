## Game rooms

- When selecting ready up, the game does not actually prevent host from starting the game, make it block the start of the game
- Allow the host to boot players from a room
- Once the instructions show and the user says theyre ready, the ready button does not actually mark as pressed on the users device
- Make sure all the games give the right instructions before the game starts. Evil laugh overlay shows the instructions for don't get caught
- All games say "you survived +100", that is not accurate for all games
- When 2 players play, and they both get 0, somehow one of the players still gets fiest and the other gets second
- At the end of a game the players are given a button to `play again`, but that button just exits them from the game room. I want the room creator to be given that button, and when pressed, all users are brought back to the original lobby but in the same room

## Odd one out

- There still are some cases where the normal user receives some kind of prompt to do an action, I want them to see that they are just normal
- I want users to be able to vote any any moment throughout the process
- If the user themselves is the odd one out, I don't want them to vote, I want them to get points based on how long they survived or based on how many people guessed wrong

## dont get caught

- The tilt control indicates to my phone that it is requesting permissiong to use tilt controls, yet nothing pops up and I am not able to actually use tilt control
- The controls can be a bit laggy from my mobile device on the network, not sure if that can be corrected
- The patrol no longer walk through walls, but now they just walk into walls instead of actually searching through normally
- I want the rooms to be a bit larger for the user to walk through, make them larger and generate the room dynamically, just ensure that some basic rules are followed to allow people to still navigate a bit
- The visual walls still do not actually line up with the walls that prevent users from moving around. A clear walking area is being blocked by an invisible wall, I think sometimes they are just off by 1 block

## Evil Laugh Overlay

- Finish implementing this, right now it shows `Get ready to record your most evil laugh...`, then once the timer is reached it just ends. - There is not really a need for a timer for this game so you can remove that configuration item from it
- The view screen just shows `Getting ready...`
- The game should start with a 2 minute block for users to select a gif. If all users select a gif before the time, then we can move on to the next step. I want all the selected gifs randomized and each user should be distributed a random gif from the pool. Then the system should select one user at a time to have 1 minute to record their laugh and overlay it on the gif the way they want. Then once it's complete each gif with its audio should be shared across the main viewer screen with audio. Once done all users should vote 

## Lowball marketplace


- Right now it is broken, the tv shows `Browsing the marketplace... A new item listing is coming up`, and the phones say `Finding the next listing...`. Then after the time limit there is a message that says the bids are in and shows the minimum limit
- I want 2 different game modes with this. I want to allow the user to select the game mode in the configuration settings at the start
- The first game mode should be what you have implemented here, where each item is displayed to all users and each one has to place a bid
- The second game mode, is I want each user to be presented with a full marketplace, where there is a grid of items that exist that they can scroll through and view more details on each item. Each user has to pick a listing and write a message to the fake seller. The message is kept on record. Each user gets to send a "message" to 2 different postings. Once complete, each post that the users commented on will be shown with their associated message. Users then get to vote on who had the funniest message at the very end

