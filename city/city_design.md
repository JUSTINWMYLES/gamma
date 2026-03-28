I want to change the way the game lobby works. I want to incorporate a 3D aspect for users to select the game they want to play just to make the whole thing look a little more fun. To do this I want the following at a high level:

- I want to use three.js to create a city
- At the center I want a skyscraper style building
- I want the window panes of this building to basically be the game cards that already exist
- I want 2 view that the user can have. 
  - One is a zoomed out 45 degree angle on the left side
  - The other is a zoomed in view front on of the window panes of the skyscraper
- As I add more games, I want the building to get taller with more window panes
- When the player is in either of the views, I want them to be able to scroll up and down the building

At a more detailed level:

- I want to support light and dark mode, where these literally represent daytime and night time, where at night there is some moonlight and building and street lights
- I want it to be soft animated and simplistic
- When a user selects a game card, I want to actually transition the camera to a part of the city that has some kind of building or scene to represent that game. For example the game where I build a fire, I want that to take the user to the forest area. For the paint game, I want to go to some canvases that are setup in a park overlooking a river. I will provide some details for each game and the type of building/scene that I want
- I want to have room for expansion of the city as I add more games
- I want the city to have streets and other buildings and some cars traveling on the road. I also want it to feel cozy by having trees and flowers and parks and grass and benches
- I want it to feel bright and happy
- I dont want any fog
- Figure out how to make the distant background not look barren or weird
- Make sure streets are actually logical and don't just run into random buildings or go under buildings

I have a sample file called trial.html that you can use for some inspiration, but it is definitely missing most of what I have asked you for here.

Implement and build this city. Come up with a plan for how I can move around the city as a developer here, but then how you will incorporate it into the actual system with my real game cards

Here is the descriptions for each game and what I want in the city to represent it:

1. Tap speed - A track and field course that goes around in a circle, make sure it looks cozy and green surrounding the track and have some stands
2. Escape maze - A lush looking garden maze somewhere in the city
3. Sound replication - A record store
4. Hot potato - A grocery store that is slightly on fire
5. Don't get caught - A bank, the idea is that the player is robbing the bank
6. Camp fire - The woods right beside the city. Make sure it has some pine trees and maybe a camping trailer or 2 by a fire in the middle
7. shave the yak - Some kind of farm where there's a single yak in a small fenced in field
8. Odd one out - A police station
9. Lowball marketplace - An auction building
10. Paint match - Some canvases in a park that is overlooking a river
11. Audio overlay - a radio station
   