A couple cleanup tasks:

- Can you remove any reference to Jackbox games, this platform is different and I don't want to associate it like that
- There are a lot of files at the base of the repository, can you go through all of the files and find proper folder homes for each one. If some should stay at the root then that's fine, but I don't think a lot of them should stay there
- Some documentation from when I first created the game is stale. Can you go through and double check all of the documentation and verify it is up to date
- There is a file called `title.html` that contains the html rendering of the title, is there a way to display that in the readme.md file at the top?
- Can you add badges to the md file in the repo? I want code coverage, grade, license, release version, and build status
- There are a lot of stale implementations and code. Can you go through and cleanup all the stale code and entire implementations that may be deprecated
- Can you review all the code and make sure that it is efficient and cleanup anything that is not necessary
- I want to change what triggers a release. What i want is anytime code is pushed to the main branch, it should trigger the ci and release pipeline, this way I can just do it from my mobile app
- For the release versions, can you make it rely on commit messages? Identify messages that should associate major, minor, or patch vesrions, and if there is a commit message in a PR, use the highest one. Please do research on how this can be done, as an example git-cliff does this
- Add any possible code coverage tests, and if there is any oportunity for new e2e tests that can be executed
- Update the makefile with any additional relevant commands
- For the installation guide or anything on how to deploy the app, make sure to include any possible pre-requisites, like the API key for GIFs or any other secrets