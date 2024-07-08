# Trent Guesser
Trent Guesser is a game inspired by geoguesser the goal is to correctly guess the building the given image is from, Despite being called Trent Guesser we actually support 7 schools, and if we found resources containg the images and building data for more schools we could quite easily add support for more :) (Feel free to make an issue or pr).

## Files
- `./dist/` - The output generated application
- `templates` - The html and scss file used to generate the copy
- `./index.js` - The node.js based preprocessor used to turn our data and config into a game
- `./config.yaml` - The yaml config used to configure and drive the game generation

## Challange

The basic premise of the challange provided was to make a polished game without using any JavaScript. This greatly limits our capabilities it proved very challanging some game concepts could not be implemented at all such as sound effects and music, and others such as keeping track of score proved very difficult. The game takes advantage of HTML form elements and sibling selectors to hold state. Essentially our game is a giant [fsm (Finite State machine)](https://en.wikipedia.org/wiki/Finite-state_machine) that uses `3` radio buttons per level a linked `correct` and `incorrect` state and a `visible state`, the code in `./templates/styles/game.scss` is responsible for manging the games state. This type of programming is very interesting as we are working in a very limited development environment where simple things require getting creative, one such example is moving to the next level which requires massive css selectors and our first implementation caused Chrome to take over a second rendering the webpage everytime an animation was fired. Using CSS in this way was heavily inspired by [No JavaScript FPS](https://keithclark.co.uk/labs/css-fps/) and [HTMX Pong](https://www.youtube.com/watch?v=1WSOXT7-5bI) which are other examples of what is possible in limited development environments.


## Credits
All code here was written by [Jake](https://github.com/spotandjake) and [Kara](https://github.com/Kara-Zor-El)

The `index.js` file and `template` data are distributed under the MIT license. We do not hold the rights to any of the generated images and do not maintain copyright or licensing over the bundled `dist` files.