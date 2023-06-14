const express = require("express");
const { open } = require("sqlite");
const app = express();
app.use(express.json());
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`Db Error : ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//Authenticate Token API
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const convertDBObjOfStatesToRespObj = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

//GET ALL STATES LIST API
app.get("/states/", authenticateToken, async (request, response) => {
  const getBooksQuery = `
    SELECT *
    FROM state`;
  const statesList = await db.all(getBooksQuery);
  let statesArray = [];
  for (let each_state of statesList) {
    const convertedState = convertDBObjOfStatesToRespObj(each_state);
    statesArray.push(convertedState);
  }
  response.send(statesArray);
});

//GET STATE DETAILS BY ID API
app.get("/states/:stateId", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
  SELECT *
  FROM state
  WHERE state_id = ${stateId};`;
  const stateDetail = await db.get(getStateQuery);
  const convertedState = convertDBObjOfStatesToRespObj(stateDetail);
  response.send(convertedState);
});

//ADD A DISTRICT API
app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const addDistrictQuery = `
    INSERT INTO
      district (district_name, state_id, cases, cured, active, deaths)
    VALUES
      (
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
      );`;

  const dbResponse = await db.run(addDistrictQuery);
  const districtId = dbResponse.lastID;
  response.send("District Successfully Added");
});

const convertDBObjOfDistrictsToRespObj = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

//district based on the district ID API
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
  SELECT *
  FROM district
  WHERE district_id = ${districtId};`;

    const districtDetail = await db.get(getDistrictQuery);
    const convertedDistrict = convertDBObjOfDistrictsToRespObj(districtDetail);
    response.send(convertedDistrict);
  }
);

//Deletes a district from the district table based on the district ID APT
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE FROM 
    district
    WHERE district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Updates the details of a specific district based on the district ID API
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrictQuery = `
  UPDATE
    district
  SET
    district_name= '${districtName}',
    state_id= ${stateId},
    cases= ${cases},
    cured= ${cured},
    active= ${active},
    deaths= ${deaths}
  WHERE 
    district_id = ${districtId};`;

    await db.run(updateDistrictQuery);
    //console.log("District Details Updated");
    response.send("District Details Updated");
  }
);

//Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID API
app.get(
  "/states/:stateId/stats",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
  SELECT
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
  FROM 
    district
  WHERE 
    state_id = ${stateId};`;
    const stats = await db.get(getStateStatsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

//Returns an object containing the state name of a district based on the district ID API
app.get(
  "/districts/:districtId/details/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getStateNameQuery = `
  SELECT
    state_name
  FROM district
  INNER JOIN state
  WHERE district_id = ${districtId};`;

    const stateNameObj = await db.get(getStateNameQuery);
    //console.log(stateNameObj);
    //console.log({ stateName: stateNameObj["state_name"] });
    response.send({ stateName: stateNameObj["state_name"] });
  }
);
module.exports = app;
