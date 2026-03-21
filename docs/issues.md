## ADR - Architectural design record

Go back through the changes and start writing out design decision records for key design components and indicate if they are superseded or if they are still valid

## Landing page

There is no real landing page that I can see when I run the `make dev` command. Make sure there is a landing page that allows users to select to join a room or create a room. Also just make it have a headline to show the app title `gamma` and to have maybe some info further down about the platform so people know what it is.

## Don't get caught

- The guards that are searching twitch quite a bit, make their motions smoother
- When I am acting as a player on the screen the joystick lets go when I move my mouse/finger outside of the shape, make it hold on
- As a player I can walk into the walls quite a bit, make sure that the walls are actually preventing users from walking into them
- Make sure that players and guards spawn in locations that allow the user to have a chance, ex. don't spawn a guard right beside a user
- The map was not random across the 3 rounds, make it random each round, feel free to make the map larger and more random
- After the final round the players screen says something about getting ready for the next round but there is no next round
- Make the guards view area more realistic, if the user is in the view for long enough they need to lose a life
- Once a guard is on alert for a specific user and they get caught, the guard does not go back to patrol, it stays active
- Give an option for the game settings to offer tilt control or joycon control

## Final Score menu

- When the final score is shown it just displays the overall score for each player, I want to keep that but as a secondary shown view
- The first thing I want is a top 3 leaderboard view where the third players score is a vertical column that starts at the bottom and scales, then the next 2 players scores do the same thing. I want the number one players score to go all the way to the top and the second and third player scores are relative to that

## Additional

- When the user says `read up` there is no way to uncheck that once they are ready, please make that an option