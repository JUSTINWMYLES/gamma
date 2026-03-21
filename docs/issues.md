## ADR - Architectural design record

Break the ADRs into individual files instead of a single file. I also don't want ADRs about the individual games, I just want it about the platform as a whole.

## Room creation and joining

- When a device selects create room, it then says waiting for room settings to be completed. The problem is, the user that created the room then can't do anything as nobody actually owns that session. When a user creates a room and joins a game, they can join either as a player or as a viewing screen, this way its not restricted to just phones and TVs. 
- Make the necessary changes to remove the idea of phone and tv, and just have players and view screen
- Make sure that when a user creates a room they are able to admin the room for the duration of the play
- Ensure that the original setup where the user settings requires at least one "tv" or "view screen" to be in the lobby if that's whats selected

## dont get caught

- The physical shapes of the room are still not matching exactly where the player is allowed to move
- As soon as a player steps into the view window of a patrol, it should shift into the next state and start the counter. Ensure that it speeds up as the user gets closer to the guard
- Ensure that the spawns after a player dies are also ok where the player wont spawn very close to a guard
- Ensure that guards spawn at least a bit apart from each other

## Mobile device on local network

I still get an error on my phone on the local network once I try to join a room on a `make dev`, fix this

## Implement registry 20 odd one out game

- Based on the markdown design document, create the game `registry-20-odd-one-out`, go all the way through and make sure it works
- Create any necessary tests around the game