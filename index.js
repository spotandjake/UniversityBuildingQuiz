// Imports
import fs from "fs";
import { parse } from "yaml";
import express from "express";
import ejs from "ejs";
import * as sass from "sass";
import { prettify, minify } from 'htmlfy';
import sharp from 'sharp';
import isCI from 'is-ci';
// Helpers
const processHTML = (config, html) => {
  try {
    return config.minifyHtml ? minify(html) : prettify(html);
  } catch (err) {
    return html;
  }
};
const processImage = async (config, url, path, pathBase) => {
  switch (config.imageSource) {
    case "LOCAL":
    case "EMBED":
      // Fetch Image
      const response = await fetch(url);
      if (response.status != 200)
        throw new Error(`Failed To Fetch Image, ${url}, ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      let image = arrayBuffer;
      if (config.optimizeImages) {
        image = await sharp(arrayBuffer)
                  .png()
                  .toBuffer();
      }
      image = Buffer.from(image);
      // Base64
      if (config.imageSource == "EMBED") {
        const base64String = image.toString('base64');
        return `data:image/png;base64,${base64String}`;
      } else {
        // Write to file
        await fs.promises.writeFile(`${pathBase}${path}`, image);
        return path;
      }
    case "SOURCE":
      return url;
    default:
      throw new Error("Config Error Unknown Image Source");
  }
}
const get_building_buttons = (current_building, building_map, building_list) => {
  const buttons = new Set();
  // Add the right awnser
  buttons.add(current_building);
  // Add the map buttons
  if (building_map != undefined && building_map[current_building] != undefined) {
    const current_bulding_map = building_map[current_building];
    shuffleArray(current_bulding_map);
    for (let i = 0; i < current_bulding_map.length && buttons.size < 6; i++) {
      buttons.add(current_bulding_map[i]);
    }
  }
  const temp_list = [...building_list];
  shuffleArray(temp_list);
  for (let i = 0; i < temp_list.length && buttons.size < 6; i++) {
    buttons.add(temp_list[i]);
  }
  // Add the remaining buttons
  return buttons;
}
const chunkArray = (arr, chunkSize) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
};
const shuffleArray = (array) => {
  /* From https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array */
  let count = array.length,
    randomnumber,
    temp;
  while (count) {
    randomnumber = (Math.random() * count--) | 0;
    temp = array[count];
    array[count] = array[randomnumber];
    array[randomnumber] = temp;
  }
};
const get_game_mode_data = (config, school, game_mode) => {
  switch (game_mode) {
    case "BUILDING": {
      // Make List Of Buildings
      const buildings = new Set();
      for (const item of school.data) {
        buildings.add(item.entry_category);
      }
      // Return Data
      return {
        building_list: Array.from(buildings),
        randomize_levels: true,
      };
    }
    default:
      throw new Error(`Invalid game Mode ${game_mode}`);
  }
};
const mapClassFindData = async (config, schoolConfig, rawData, imagePath) => {
  // Maps classfind data into a generic format, and fetches all resources
  const data = [];
  const room_images = new Map();
  for (const entry of rawData) {
    try {
      // Fetch Images
      let imgPath = `/schools/${schoolConfig.name}/images/${entry.roomimg}`;
      imgPath = imgPath.substring(0, imgPath.lastIndexOf(".")) + ".png";
      if (!room_images.has(entry.roomimg)) {
        let img = null;
        try {
          img = await processImage(
            config,
            `https://classfind.com/${schoolConfig.name.toLowerCase()}/720/${entry.roomimg}`,
            imgPath,
            imagePath
          );
        } catch (err) {
          img = await processImage(
            config,
            `https://classfind.com/${schoolConfig.name.toLowerCase()}/${entry.roomimg}`,
            imgPath,
            imagePath
          );
        }
        room_images.set(entry.roomimg, img);
      }
      // Map Data
      data.push({
        entry_label: entry.label,
        entry_category: entry.category,
        entry_image: room_images.get(entry.roomimg),
      });
    } catch (err) {
      if (!schoolConfig.error_graceful) throw err;
    }
  }
  // Return data
  return data;
};
const fetchCache = async (config) => {
  // Clear Cache if needed
  if (!config.cache && fs.existsSync("./dist/")) {
    await fs.promises.rm("./dist/", { recursive: true, force: true });
  }
  // Check If File Structure Exists
  if (!fs.existsSync("./dist/")) await fs.promises.mkdir("./dist/");
  if (!fs.existsSync("./dist/styles/"))
    await fs.promises.mkdir("./dist/styles/");
  if (!fs.existsSync("./dist/schools/"))
    await fs.promises.mkdir("./dist/schools/");
  // For each School Item Check If It Exists
  const caches = [];
  for (const school of config.schools) {
    if (school.enabled == false) continue;
    // Check If Cache Exists
    if (
      config.cache &&
      fs.existsSync(`./dist/schools/${school.name}/cache.json`)
    ) {
      const rawCache = await fs.promises.readFile(
        `./dist/schools/${school.name}/cache.json`,
      );
      try {
        const parsedCache = JSON.parse(rawCache);
        caches.push(parsedCache);
        continue;
      } catch (_) {}
    }
    // Clear File Structure
    if (fs.existsSync(`./dist/schools/${school.name}/`))
      await fs.promises.rm(`./dist/schools/${school.name}/`, {
        recursive: true,
      });
    if (fs.existsSync(`./dist/schools/${school.name}/images/`))
      await fs.promises.rm(`./dist/schools/${school.name}/images/`, {
        recursive: true,
      });
    // Generate File Structure
    await fs.promises.mkdir(`./dist/schools/${school.name}/`);
    await fs.promises.mkdir(`./dist/schools/${school.name}/images/`);
    // Fetch Data
    const rawData = await fs.promises.readFile(school.data);
    let data = [];
    try {
      data = JSON.parse(rawData);
    } catch (_) {
      throw new Error(`Failed to parse data from ${school.data}`);
    }
    // Generate Cache
    let parsedData = [];
    switch (school.processor) {
      case "CLASS_FIND":
        parsedData = await mapClassFindData(
          config,
          school,
          data,
          `./dist/`,
        );
        break;
      default:
        throw new Error("Unknown Data Proccessor");
    }
    const schoolPackage = {
      school_name: school.name,
      game_modes: school.game_modes,
      data: parsedData,
    };
    await fs.promises.writeFile(
      `./dist/schools/${school.name}/cache.json`,
      JSON.stringify(schoolPackage, null, 2),
    );
    caches.push(schoolPackage);
  }
  // Return Caches
  return caches;
};
// Generator
const generate_game = async (config) => {
  // Load Templates
  const rawHometemplate = await fs.promises.readFile(
    "./templates/index.ejs",
    "utf-8",
  );
  const rawGameTemplate = await fs.promises.readFile(
    "./templates/game.ejs",
    "utf-8",
  );
  const rawSelectionTemplate = await fs.promises.readFile(
    "./templates/selection.ejs",
    "utf-8",
  );
  const rawAboutTemplate = await fs.promises.readFile(
    "./templates/about.ejs",
    "utf-8",
  );
  const rawCreditsTemplate = await fs.promises.readFile(
    "./templates/credits.ejs",
    "utf-8",
  );
  // Compile Templates
  let homeTemplate, gameTemplate, selectionTemplate, aboutTemplate, creditsTemplate;
  try {
    homeTemplate = ejs.compile(rawHometemplate);
  } catch (err) {
    homeTemplate = ejs.compile('');
    console.log(err);
    console.log('Error: Failed to compile home Template');
  }
  try {
    gameTemplate = ejs.compile(rawGameTemplate);
  } catch (err) {
    gameTemplate = ejs.compile('');
    console.log(err);
    console.log('Error: Failed to compile game Template');
  }
  try {
    selectionTemplate = ejs.compile(rawSelectionTemplate);
  } catch (err) {
    selectionTemplate = ejs.compile('');
    console.log(err);
    console.log('Error: Failed to compile selection Template');
  }
  try {
    aboutTemplate = ejs.compile(rawAboutTemplate);
  } catch (err) {
    aboutTemplate = ejs.compile('');
    console.log(err);
    console.log('Error: Failed to compile about Template');
  }
  try {
    creditsTemplate = ejs.compile(rawCreditsTemplate);
  } catch (err) {
    creditsTemplate = ejs.compile('');
    console.log(err);
    console.log('Error: Failed to compile credits Template');
  }
  // Load SCSS
  const rawThemeStyle = await fs.promises.readFile(
    "./templates/styles/theme.scss",
    "utf-8",
  );
  const rawMainStyle = await fs.promises.readFile(
    "./templates/styles/main.scss",
    "utf-8",
  );
  const rawGameStyle = await fs.promises.readFile(
    "./templates/styles/game.scss",
    "utf-8",
  );
  const themeStyle = sass.compileString(rawThemeStyle, config.scssConfig);
  const mainStyle = sass.compileString(rawMainStyle, config.scssConfig);
  // Handle Cache
  const data = await fetchCache(config);
  // Generate School Selection Screen
  const selection_screen_link =
    config.include_single_select || data.length > 1
      ? undefined
      : `./schools/${data[0].school_name}`;
  if (selection_screen_link == undefined) {
    // Generate Page
    const selections = [];
    for (const school of data) {
      selections.push({
        selection_name: school.school_name,
        selection_location: `schools/${school.school_name}/`,
      });
    }
    const schoolSelection = processHTML(config, selectionTemplate({ screen_name: 'School', selections }));
    // Write HTML
    await fs.promises.writeFile("./dist/schoolSelect.html", schoolSelection);
  } else if (fs.existsSync("./dist/schoolSelect.html")) {
    await fs.promises.rm("./dist/schoolSelect.html");
  }
  // Generate Game Stuff
  for (const school of data) {
    // Handle game Modes
    const multipleSelectionScreens = config.include_single_select || school.game_modes.length > 1;
    for (const game_mode of school.game_modes) {
      // Validate Game Mode
      const game_data = get_game_mode_data(config, school, game_mode);
      // Randomize Levels if needed
      const roundData = school.data;
      if (game_data.randomize_levels) shuffleArray(roundData)
      // Chunk Data Into levels
      const chunkedData = chunkArray(roundData, config.schools.find((e) => e.name == school.school_name).max_level_size);
      // Clear File Structure
      if (fs.existsSync(`./dist/schools/${school.school_name}/${game_mode}/`))
        await fs.promises.rm(
          `./dist/schools/${school.school_name}/${game_mode}/`,
          { recursive: true },
        );
      // Generate The File Structure
      await fs.promises.mkdir(`./dist/schools/${school.school_name}/${game_mode}/`,);
      // Generate Selection Screens
      const selections = [];
      for (let levelIndex = 1; levelIndex <= chunkedData.length; levelIndex++) {
        selections.push({
          selection_name: `Level ${levelIndex}`,
          selection_location: `${multipleSelectionScreens ? '' : `${game_mode}`}/level${levelIndex}.html`,
        });
      }
      const levelSelection = processHTML(config, selectionTemplate({ screen_name: 'Level', selections }));
      if (multipleSelectionScreens) {
        // Write to game_mode root
        await fs.promises.writeFile(
          `./dist/schools/${school.school_name}/${game_mode}/index.html`,
          levelSelection,
        );
      } else {
        // Write to root
        await fs.promises.writeFile(
          `./dist/schools/${school.school_name}/index.html`,
          levelSelection,
        );
      }
      // Generate Levels
      for (let i = 0; i < chunkedData.length; i++) {
        const roundData = chunkedData[i];
        // Build CSS
        const gameStyle = sass.compileString(rawGameStyle, {
          ...config.scssConfig,
         importers: [{
           canonicalize(url) {
             if (!url == "config:settings") return null;
             return new URL(url);
           },
           load(_) {
             // TODO: Validate we are loading only the correct url
             return {
               contents: `$roundCount: ${roundData.length};\n$debug_hidden: ${!config.debug};`,
               syntax: 'scss'
             };
           }
         }]
        });
        await fs.promises.writeFile(`./dist/schools/${school.school_name}/${game_mode}/level${i+1}.css`, gameStyle.css);
        // Process Building Map
        const building_map = {};
        for (const building of config.schools.find((e) => e.name == school.school_name).building_map) {
          building_map[building.name] = building.similar_buildings;
        }
        // Build Level
        const renderedLevel = processHTML(config, gameTemplate({
          game_mode: game_mode,
          level: i + 1,
          school_name: school.school_name,
          finish_url: '../',
          building_map: building_map,
          building_list: game_data.building_list,
          level_data: roundData,
          get_building_buttons: get_building_buttons,
        }));
        // Write Level to file
        await fs.promises.writeFile(`./dist/schools/${school.school_name}/${game_mode}/level${i + 1}.html`, renderedLevel);
      }
    }
    // Generate Game Mode Selection Screen
    if (multipleSelectionScreens) {
      // Generate Page
      const selections = [];
      for (const game_mode of school.game_modes) {
        selections.push({
          selection_name: game_mode,
          selection_location: `/${game_mode}/`,
        });
      }
      const gameSelection = processHTML(config, selectionTemplate({ screen_name: 'Game Mode', selections }));
      // Write HTML
      await fs.promises.writeFile(
        `./dist/schools/${school.school_name}/index.html`,
        gameSelection,
      );
    }
  }
  // Write HTML
  await fs.promises.writeFile(
    "./dist/index.html",
    processHTML(config, homeTemplate({ selection_screen_link })),
  );
  await fs.promises.writeFile(
    "./dist/credits.html",
    processHTML(config, creditsTemplate()),
  );
  await fs.promises.writeFile(
    "./dist/about.html",
    processHTML(config, aboutTemplate()),
  );
  // Write CSS
  await fs.promises.writeFile("./dist/styles/theme.css", themeStyle.css);
  await fs.promises.writeFile("./dist/styles/main.css", mainStyle.css);
  // Clear Resources
  if (fs.existsSync('./dist/resources/'))
    await fs.promises.rm('./dist/resources', { recursive: true });
  // Copy Resources
  await fs.promises.cp('./templates/resources/', './dist/resources/', { recursive: true });
  // Host if needed
  if (config.host && !isCI) {
    const app = express();
    app.use(express.static("dist"));
    app.listen(3000, () => {
      console.log("Server Started");
    });
  }
};
// Parse Config
const rawConfig = await fs.promises.readFile("./config.yaml", "utf-8");
const config = parse(rawConfig);
// Generate Game
generate_game(config);
