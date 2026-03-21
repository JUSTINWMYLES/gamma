Stack

	∙	Colyseus — server, authoritative game state, room management
	∙	Phaser — TV display rendering (optional, plain HTML is fine for pure UI)
	∙	Colyseus.js client — phone controllers, lightweight HTML pages

Architecture

Two client types connect to the same Colyseus room:

	∙	TV display — renders game state, sends no input, runs in a browser on a laptop/Chromecast
	∙	Phone controller — minimal UI, sends input only, no need to render the full game

Roles are assigned at join time via an options flag. Room code is the Colyseus room ID, displayed on the TV for players to type at a join URL.

Server is the source of truth. Clients react to state changes, never trust their own state.

State Management

	∙	Use Colyseus Schema for anything all clients need to see (scores, phase, player list)
	∙	Use a plain server-side Map for private data (answers before reveal) — move into Schema only when it should be visible
	∙	Use client.send() for per-player private messages

Game Session Flow

Host loads TV display → room created → code shown
Players go to /join → enter code → join as controllers
Host starts game → phase changes → all clients react
Players submit input → server validates → state updates
Server advances phase → repeat or end


Input Methods



|Input          |Reliability|Notes                                                |
|---------------|-----------|-----------------------------------------------------|
|Touch / buttons|High       |Use everywhere                                       |
|Text input     |High       |Core Jackbox mechanic                                |
|Gyroscope      |Medium     |iOS needs permission prompt, throttle to ~20hz       |
|Accelerometer  |Medium     |Good for shake/threshold, bad for pattern recognition|
|Microphone     |Medium     |Unreliable in noisy rooms                            |
|Camera         |Low-Medium |High novelty, needs HTTPS, best for turn-based       |
|Vibration      |Output only|Android only                                         |

Motion Detection Limits

	∙	Stick to threshold/binary detection — shake, tilt held, single tap
	∙	Avoid rep counting or pattern recognition on accelerometer — too noisy, too device-dependent
	∙	For real body tracking use TensorFlow.js PoseNet via camera instead

Game Ideas Worth Building

Low complexity, high fun:

	∙	Keep It Steady — stillness competition
	∙	Worst Answer Wins — reverse scoring trivia
	∙	Telephone Pictionary — drawing chain

Medium complexity:

	∙	Photo Caption Battle — camera snapshots, human judging, no ML needed
	∙	Lie Detector — two truths one lie
	∙	Autocomplete Story — one sentence per player

Higher complexity:

	∙	Draw With Your Body — PoseNet silhouette
	∙	Impostor Conductor — hidden role + gyroscope

Key Design Rules

	∙	Don’t send raw gyroscope events — throttle to 20hz, dead zone small movements, calibrate resting position on join
	∙	Don’t put data in Schema state until it should be visible to all clients
	∙	Host is just a client with a flag — track hostSessionId in room state
	∙	Design state to survive disconnects — don’t delete player data immediately on leave
	∙	Phaser is only worth it if you have actual 2D game elements — use plain HTML for pure UI screens​​​​​​​​​​​​​​​​