// ============================================================
// FOOLS' VALLEY RESIDENCY APPLICATION BACKEND
// Google Apps Script for handling room availability & applications
// ============================================================

// Configuration - Update these sheet names to match your Google Sheet
const ROOMS_SHEET = 'prices';  // This has room data: IDs, names, buildings, daily/weekly/monthly rates
const BOOKINGS_SHEET = 'bookings';  // Will be created if it doesn't exist
const APPLICATIONS_SHEET = 'applications';  // Will be created automatically
const TUCKER_APPLICATIONS_SHEET = 'tucker applications';
const NYE_APPLICATIONS_SHEET = 'nye applications';

// New Year CI Festival, Dec 28 2026 - Jan 11 2027 (requests with ?event=nye / eventType 'nye').
// Fixed dates and fixed prices for the whole festival. Food is per person; room and bed prices are not.
const NYE = {
  start: '2026-12-28',
  end: '2027-01-11',
  nights: 14,
  foodPerDay: 30,        // food & facilities, per person per day
  facilitatorsFee: 0,    // per person, set it here once known; collected with the booking and passed on to Francisco weekly
  cap: 38,               // people in total across all bookings
  rooms: {
    // 'bed' prices are per bed, 'room' prices per room (1 or 2 people), 'spot' per van spot
    dorm_oh:  { price: 210,  unit: 'bed',  capacity: 6 },
    dorm_bh:  { price: 210,  unit: 'bed',  capacity: 4 },
    zen:      { price: 210,  unit: 'bed',  capacity: 4 },
    hallway:  { price: 210,  unit: 'bed',  capacity: 4 },
    mbig:     { price: 350,  unit: 'bed',  capacity: 4 },
    mcurve:   { price: 350,  unit: 'bed',  capacity: 2 },
    mdouble:  { price: 350,  unit: 'bed',  capacity: 2 },
    ensuite:  { price: 350,  unit: 'bed',  capacity: 2 },
    normal_m: { price: 350,  unit: 'bed',  capacity: 2 },
    normal_n: { price: 350,  unit: 'bed',  capacity: 2 },
    chafariz: { price: 1050, unit: 'room', capacity: 1, maxPeople: 2 },
    isabel:   { price: 780,  unit: 'room', capacity: 1, maxPeople: 2 },
    studio:   { price: 670,  unit: 'room', capacity: 1, maxPeople: 2 },
    normal_s: { price: 650,  unit: 'room', capacity: 1, maxPeople: 1 },
    van:      { price: 140,  unit: 'spot', capacity: 5 }
  }
  // Not listed, so not bookable for the festival: apartment / apt_a / apt_b and sunny (organisers' team),
  // galeria and library (our staff), pool, downstairs, tipi.
};

// Event Blocking - Block ALL rooms during special events
// Add date ranges here to make all rooms unavailable
const EVENT_BLOCKS = [
  {
    name: 'Summer Event 2026',
    startDate: '2026-07-04',  // July 4, 2026
    endDate: '2026-08-02'     // August 2, 2026 (exclusive - Aug 2 is free)
  },
  {
    name: 'Tucker Peck Retreat 2027',
    startDate: '2027-01-29',  // Jan 29, 2027
    endDate: '2027-02-05',    // Feb 5, 2027 (exclusive - Feb 5 checkout morning stays free)
    exceptEvent: 'tucker'     // requests with ?event=tucker bypass this block
  },
  {
    name: 'New Year CI Festival 2026-27',
    startDate: '2026-12-28',  // Dec 28, 2026
    endDate: '2027-01-11',    // Jan 11, 2027 (exclusive - checkout morning stays free)
    exceptEvent: 'nye'        // requests with ?event=nye bypass this block
  }
  // Add more event blocks here as needed
];

// Composite Rooms - one bookable unit made of several calendar columns.
// The whole apartment is free only when both of its rooms are free, and a
// whole-apartment booking is written into both columns. Each half can also be
// booked on its own (apt_a / apt_b rows in the prices sheet).
const COMPOSITE_ROOMS = {
  apartment: ['apt_a', 'apt_b']
};

// ============================================================
// MAIN HANDLER
// ============================================================
function doGet(e) {
  const action = e.parameter.action;

  if (action === 'availability') {
    return handleAvailability(e);
  } else if (action === 'prices') {
    return handlePrices(e);
  }

  return ContentService.createTextOutput(JSON.stringify({
    error: 'Invalid action'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'submit') {
      return handleSubmission(data);
    }

    return ContentService.createTextOutput(JSON.stringify({
      error: 'Invalid action'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Invalid request format: ' + err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// PRICING CALCULATION - SIMPLE TIER BREAKPOINTS
// ============================================================
function calculateRoomPrice(dailyRate, weeklyRate, twoWeekRate, monthlyRate, numDays) {
  // Tier breakpoint pricing:
  // 1-5 days: Daily rate (numDays × daily)
  // 6 days: min(full weekly rate, 6 × daily)
  // 7-13 days: Weekly rate prorated (weekly ÷ 7 × numDays)
  // 14-27 days: 2-week rate prorated (twoWeek ÷ 14 × numDays)
  // 28+ days: Monthly rate prorated (monthly ÷ 30.5 × numDays)

  let roomPrice, priceBreakdown;

  if (numDays >= 28) {
    // 28+ days: Prorated monthly rate
    roomPrice = Math.round((monthlyRate / 30.5) * numDays);
    priceBreakdown = '€' + monthlyRate + '/month';
  } else if (numDays >= 14) {
    // 14-27 days: Prorated 2-week rate
    roomPrice = Math.round((twoWeekRate / 14) * numDays);
    priceBreakdown = '€' + twoWeekRate + '/2 weeks';
  } else if (numDays >= 7) {
    // 7-13 days: Prorated weekly rate
    roomPrice = Math.round((weeklyRate / 7) * numDays);
    priceBreakdown = '€' + weeklyRate + '/week';
  } else if (numDays === 6) {
    // 6 days: Choose lower of full weekly rate or 6 × daily rate
    const dailyPrice = Math.round(6 * dailyRate);
    if (weeklyRate < dailyPrice) {
      roomPrice = weeklyRate;
      priceBreakdown = '€' + weeklyRate + '/week';
    } else {
      roomPrice = dailyPrice;
      priceBreakdown = '€' + dailyRate + '/day';
    }
  } else {
    // 1-5 days: Daily rate
    roomPrice = Math.round(numDays * dailyRate);
    priceBreakdown = '€' + dailyRate + '/day';
  }

  return {
    roomPrice: roomPrice,
    priceBreakdown: priceBreakdown
  };
}

// ============================================================
// DAILY FEE
// ============================================================
// Per-day fee comes from the prices sheet: a block headed 'DAILY FEE' with four tier rows
// below it (daily / weekly / biweekly / monthly), the fee being the first number to the
// right of each label. The block is found by its label, so it may sit in any row or column.
function getDailyFeeRate(roomsSheet, numDays) {
  const data = roomsSheet.getDataRange().getValues();
  let tiers = null;
  for (let r = 0; r < data.length && !tiers; r++) {
    for (let c = 0; c < data[r].length; c++) {
      if (String(data[r][c]).trim().toUpperCase() === 'DAILY FEE') {
        tiers = [];
        for (let k = 1; k <= 4; k++) {
          const row = data[r + k] || [];
          let fee = NaN;
          for (let cc = c + 1; cc < row.length; cc++) {
            const n = parseFloat(row[cc]);
            if (!isNaN(n)) { fee = n; break; }
          }
          tiers.push(fee);
        }
        break;
      }
    }
  }
  if (!tiers) return 20; // Fall back to €20/day if the block is missing
  let fee;
  if (numDays >= 28) fee = tiers[3];
  else if (numDays >= 14) fee = tiers[2];
  else if (numDays >= 7) fee = tiers[1];
  else fee = tiers[0];
  return isNaN(fee) ? 20 : fee;
}

// ============================================================
// HANDLE AVAILABILITY REQUEST
// ============================================================
function handleAvailability(e) {
  try {
    const from = e.parameter.from; // ISO format: YYYY-MM-DD
    const to = e.parameter.to;
    const eventParam = e.parameter.event || '';

    if (!from || !to) {
      return jsonResponse({ error: 'Missing date parameters' });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const numDays = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));

    if (numDays <= 0) {
      return jsonResponse({ error: 'Invalid date range' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roomsSheet = ss.getSheetByName(ROOMS_SHEET);

    if (!roomsSheet) {
      // List all available sheets to help debug
      const allSheets = ss.getSheets().map(s => s.getName()).join(', ');
      return jsonResponse({
        error: 'Rooms sheet "' + ROOMS_SHEET + '" not found. Available sheets: ' + allSheets
      });
    }

    // Get all rooms data first
    const roomsData = roomsSheet.getDataRange().getValues();
    const roomsHeaders = roomsData[0];
    const rooms = [];

    // Parse rooms (skip header row)
    // First, log the header to understand the actual structure
    if (roomsData.length > 0) {
      Logger.log('Prices sheet headers: ' + roomsData[0].join(', '));
      if (roomsData.length > 1) {
        Logger.log('First room row: ' + roomsData[1].join(' | '));
      }
    }

    // Prices sheet columns: room_id, name, building, monthly, weekly, daily, photo, description, columns, type, group_key
    for (let i = 1; i < roomsData.length; i++) {
      const row = roomsData[i];
      if (!row[0]) continue; // Skip empty rows
      if (!row[2]) continue; // Rows without a building (the daily fee table, other tables) are not rooms

      // Determine capacity based on room type and specific room ID
      let capacity = 1;  // Default for private rooms
      const roomName = row[1] || '';
      const roomId = row[0] || '';

      // Set specific capacities for multi-bed rooms
      if (roomId === 'dorm_oh') {
        capacity = 6;  // Old House dorm has 6 bunks
      } else if (roomId === 'dorm_bh') {
        capacity = 4;  // Blue House dorm has 4 bunks
      } else if (roomId === 'van') {
        capacity = 4;  // 4 camping spots (A, B, C, D)
      } else if (roomId === 'tipi') {
        capacity = 4;  // 4 tipi spots
      } else if (roomId === 'zen') {
        capacity = 4;  // zen room, 4 beds (events only)
      } else if (roomId === 'hallway') {
        capacity = 4;  // Blue House ground-floor hallway, 4 beds (events only)
      }

      const room = {
        id: row[0],           // Column A: room_id
        name: row[1],         // Column B: name
        building: row[2],     // Column C: building
        desc: row[8] || '',   // Column I: description
        photo: row[7] || '',  // Column H: photo
        capacity: capacity,
        daily: parseFloat(row[6]) || 0,      // Column G: daily (UPDATED)
        weekly: parseFloat(row[5]) || 0,     // Column F: weekly (UPDATED)
        twoWeek: parseFloat(row[4]) || 0,    // Column E: two weeks (NEW)
        monthly: parseFloat(row[3]) || 0,    // Column D: monthly
        active: true  // All rooms in prices sheet are active
      };

      rooms.push(room);
    }

    // Read calendar from "valley rooms" sheet
    const valleySheet = ss.getSheetByName('valley rooms');
    const bookings = [];

    if (valleySheet) {
      // Parse calendar format to extract bookings
      const calendarData = valleySheet.getDataRange().getValues();

      // Row 3 (index 2) has room names, starting from column F (index 5)
      const roomRow = calendarData[2];
      const roomColumnMap = {};  // Maps column index to room name

      for (let col = 5; col < roomRow.length; col++) {
        if (roomRow[col]) {
          roomColumnMap[col] = String(roomRow[col]).toLowerCase().trim();
        }
      }

      // Create room name to ID mapping from prices sheet
      const roomNameToId = {};
      for (const room of rooms) {
        const roomNameLower = String(room.name).toLowerCase().trim();
        roomNameToId[roomNameLower] = room.id;

        // Map calendar names to room IDs
        // Octopus House
        if (room.id === 'mcurve') { roomNameToId['m curve suite'] = room.id; roomNameToId['m curve suite 2'] = room.id; }
        if (room.id === 'mbig') { ['m big suite', 'm big suite 2', 'm big suite 3', 'm big suite 4'].forEach(n => roomNameToId[n] = room.id); }
        if (room.id === 'mdouble') { roomNameToId['m double'] = room.id; roomNameToId['m double 2'] = room.id; }

        // Old House
        if (room.id === 'studio') roomNameToId['studio'] = room.id;
        if (room.id === 'galeria') roomNameToId['galeria'] = room.id;
        if (room.id === 'chafariz') roomNameToId['chafariz suite'] = room.id;
        if (room.id === 'library') roomNameToId['library suite'] = room.id;
        if (room.id === 'isabel') roomNameToId['isabel'] = room.id;
        if (room.id === 'zen') { ['zen 1', 'zen 2', 'zen 3', 'zen 4'].forEach(n => roomNameToId[n] = room.id); }
        if (room.id === 'dorm_oh') {
          roomNameToId['master bunk 1'] = room.id;
          roomNameToId['master bunk 2'] = room.id;
          roomNameToId['master bunk 3'] = room.id;
          roomNameToId['master bunk 4'] = room.id;
          roomNameToId['master bunk 5'] = room.id;
          roomNameToId['master bunk 6'] = room.id;
        }

        // Blue House
        if (room.id === 'ensuite') { roomNameToId['en suite'] = room.id; roomNameToId['en suite 2'] = room.id; }
        if (room.id === 'sunny') roomNameToId['sunny'] = room.id;
        if (room.id === 'normal_s') roomNameToId['normal south'] = room.id;
        if (room.id === 'normal_m') { roomNameToId['normal middle'] = room.id; roomNameToId['normal middle 2'] = room.id; }
        if (room.id === 'normal_n') { roomNameToId['normal north'] = room.id; roomNameToId['normal north 2'] = room.id; }
        if (room.id === 'hallway') { ['hallway 1', 'hallway 2', 'hallway 3', 'hallway 4'].forEach(n => roomNameToId[n] = room.id); }
        if (room.id === 'pool') roomNameToId['pool'] = room.id;
        if (room.id === 'downstairs') roomNameToId['downstairs'] = room.id;
        if (room.id === 'apt_a') roomNameToId['apartment a'] = room.id;
        if (room.id === 'apt_b') roomNameToId['apartment b'] = room.id;
        // 'apartment' (the whole thing) has no column of its own: see COMPOSITE_ROOMS
        if (room.id === 'dorm_bh') {
          roomNameToId['bunk 1'] = room.id;
          roomNameToId['bunk 2'] = room.id;
          roomNameToId['bunk 3'] = room.id;
          roomNameToId['bunk 4'] = room.id;
        }

        // Camping
        if (room.id === 'van') {
          ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach(n => roomNameToId[n] = room.id);
        }

        // Tipi
        if (room.id === 'tipi') {
          roomNameToId['1'] = room.id;
          roomNameToId['1.0'] = room.id;
          roomNameToId['2'] = room.id;
          roomNameToId['2.0'] = room.id;
          roomNameToId['3'] = room.id;
          roomNameToId['3.0'] = room.id;
          roomNameToId['4'] = room.id;
          roomNameToId['4.0'] = room.id;
        }
      }

      // Read dates and bookings (starting from row 6, index 5)
      for (let row = 5; row < Math.min(calendarData.length, 1500); row++) {
        const rowData = calendarData[row];

        // Get date from column B, C, or D (indices 1, 2, 3)
        let dateVal = null;
        for (let col = 1; col <= 3; col++) {
          if (rowData[col] instanceof Date) {
            dateVal = new Date(rowData[col]);
            break;
          }
        }

        if (!dateVal) continue;

        // Check each room column
        for (const [colIdx, roomName] of Object.entries(roomColumnMap)) {
          const cellValue = rowData[colIdx];
          // If cell has content (guest name), room is booked that day
          if (cellValue && String(cellValue).trim().length > 0) {
            const roomId = roomNameToId[roomName];
            if (roomId) {
              // Record this as a single-day booking
              bookings.push({
                roomId: roomId,
                date: dateVal
              });
            }
          }
        }
      }
    }

    // Tucker retreat: dorms are offered with retreat-specific labels
    if (eventParam === 'tucker') {
      for (const room of rooms) {
        if (room.id === 'dorm_oh') room.name = 'Male dorm';
        if (room.id === 'dorm_bh') room.name = 'Mixed dorm';
      }
    }

    if (eventParam === 'nye' && (from !== NYE.start || to !== NYE.end)) {
      return jsonResponse({ error: 'The festival runs ' + NYE.start + ' to ' + NYE.end + ' only' });
    }

    // Check availability and calculate prices
    const normalDailyFeeRate = getDailyFeeRate(roomsSheet, numDays);
    const availableRooms = [];

    for (const room of rooms) {
      // Tucker retreat: no camping/tipi/van in January
      if (eventParam === 'tucker' && (room.building === 'Camping' || room.id === 'van' || room.id === 'tipi')) {
        continue;
      }
      if (eventParam === 'nye') {
        // Festival: only the spaces on its list, at the festival's capacities
        const cfg = NYE.rooms[room.id];
        if (!cfg) continue;
        room.capacity = cfg.capacity;
      } else if (!room.daily && !room.weekly && !room.monthly) {
        continue; // spaces with no residency prices (zen, hallway) are only sold for events
      }

      const available = checkRoomAvailability(room, bookings, fromDate, toDate, eventParam);

      if (available.isAvailable) {
        let pricing, dailyFee;

        if (eventParam === 'tucker') {
          // Retreat pricing: weekly rate pro rata, dorms €100/week, fee €35/day
          const weeklyRate = (room.id === 'dorm_oh' || room.id === 'dorm_bh') ? 100 : room.weekly;
          pricing = {
            roomPrice: Math.round((weeklyRate / 7) * numDays),
            priceBreakdown: '€' + weeklyRate + '/week'
          };
          dailyFee = numDays * 35;
        } else if (eventParam === 'nye') {
          // Festival pricing: fixed for the whole stay; food per person
          const cfg = NYE.rooms[room.id];
          pricing = {
            roomPrice: cfg.price,
            priceBreakdown: '€' + cfg.price + ' per ' + cfg.unit + ', whole festival'
          };
          dailyFee = NYE.foodPerDay * numDays;
        } else {
          pricing = calculateRoomPrice(room.daily, room.weekly, room.twoWeek, room.monthly, numDays);
          dailyFee = numDays * normalDailyFeeRate;
        }

        const totalPrice = pricing.roomPrice + dailyFee;

        availableRooms.push({
          id: room.id,
          name: available.displayName,
          building: room.building,
          desc: room.desc,
          photo: room.photo,
          roomPrice: pricing.roomPrice,
          priceBreakdown: pricing.priceBreakdown,
          dailyFee: dailyFee,
          totalPrice: totalPrice,
          numDays: numDays,
          availableCount: available.availableCount,
          unit: eventParam === 'nye' ? NYE.rooms[room.id].unit : undefined,
          maxPeople: eventParam === 'nye' ? (NYE.rooms[room.id].maxPeople || 1) : undefined
        });
      }
    }

    if (eventParam === 'nye') {
      return jsonResponse({
        rooms: availableRooms,
        event: 'nye',
        nights: NYE.nights,
        foodPerDay: NYE.foodPerDay,
        facilitatorsFee: NYE.facilitatorsFee,
        peopleLeft: Math.max(0, NYE.cap - nyePeopleBooked(ss))
      });
    }

    return jsonResponse({ rooms: availableRooms });

  } catch (err) {
    Logger.log('Error in handleAvailability: ' + err.message);
    return jsonResponse({ error: err.message });
  }
}

// ============================================================
// CHECK ROOM AVAILABILITY (Calendar format)
// ============================================================
function checkRoomAvailability(room, bookings, fromDate, toDate, eventParam) {
  // For calendar format, bookings is an array of {roomId, date}
  // For each day in the requested range, count how many beds/spots are booked
  // If ANY day is fully booked, the room is unavailable for that date range

  // IMPORTANT: Checkout date is NOT occupied (guest leaves that morning)
  // So for April 1-5 booking: April 1,2,3,4 are occupied, April 5 is FREE

  // Helper function to get date string without timezone issues
  function toDateString(dateObj) {
    const d = new Date(dateObj);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Get all dates in the requested range (arrival inclusive, departure exclusive)
  const requestedDates = [];
  const current = new Date(fromDate);
  const end = new Date(toDate);

  while (current < end) {
    requestedDates.push(toDateString(current));
    current.setDate(current.getDate() + 1);
  }

  Logger.log('Checking availability for ' + room.id + ' for dates: ' + requestedDates.join(', '));

  // Check if any requested date falls within an event block
  for (const eventBlock of EVENT_BLOCKS) {
    // Blocks can be bypassed for their own event's booking page
    if (eventBlock.exceptEvent && eventBlock.exceptEvent === eventParam) continue;
    const blockStart = new Date(eventBlock.startDate);
    const blockEnd = new Date(eventBlock.endDate);

    for (const dateStr of requestedDates) {
      const checkDate = new Date(dateStr);
      if (checkDate >= blockStart && checkDate < blockEnd) {
        // Room is blocked due to event
        Logger.log('  Room blocked by event: ' + eventBlock.name);
        return {
          isAvailable: false,
          availableCount: 0,
          displayName: room.name
        };
      }
    }
  }

  // For each day, count bookings. A composite room is taken when any of its parts is.
  const partIds = COMPOSITE_ROOMS[room.id] || [room.id];
  let maxBookedOnAnyDay = 0;
  for (const dateStr of requestedDates) {
    let bookedOnThisDay = 0;
    for (const booking of bookings) {
      if (partIds.includes(booking.roomId)) {
        const bookingDate = toDateString(booking.date);
        if (bookingDate === dateStr) {
          bookedOnThisDay++;
        }
      }
    }
    if (bookedOnThisDay > 0) {
      Logger.log('  ' + dateStr + ': ' + bookedOnThisDay + ' booking(s)');
    }
    maxBookedOnAnyDay = Math.max(maxBookedOnAnyDay, bookedOnThisDay);
  }

  // Calculate available capacity (minimum across all days)
  const availableCount = Math.max(0, room.capacity - maxBookedOnAnyDay);
  const isAvailable = availableCount > 0;

  // Generate display name for multi-capacity rooms
  let displayName = room.name;
  if (room.capacity > 1 && isAvailable) {
    const unitType = room.building === 'Camping' ? 'spot' : 'bed';
    const plural = availableCount !== 1 ? 's' : '';
    displayName = room.name + ' (' + availableCount + ' ' + unitType + plural + ' available)';
  }

  return {
    isAvailable: isAvailable,
    availableCount: availableCount,
    displayName: displayName
  };
}

// ============================================================
// HANDLE PRICE LIST REQUEST
// ============================================================
function handlePrices(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roomsSheet = ss.getSheetByName(ROOMS_SHEET);

    if (!roomsSheet) {
      const allSheets = ss.getSheets().map(s => s.getName()).join(', ');
      return jsonResponse({
        error: 'Rooms sheet "' + ROOMS_SHEET + '" not found. Available sheets: ' + allSheets
      });
    }

    const roomsData = roomsSheet.getDataRange().getValues();
    const rooms = [];

    // Parse rooms (skip header row)
    // Prices sheet columns: room_id, name, building, monthly, twoWeek, weekly, daily, photo, description
    for (let i = 1; i < roomsData.length; i++) {
      const row = roomsData[i];
      if (!row[0]) continue; // Skip empty rows
      if (!row[2]) continue; // Rows without a building (the daily fee table, other tables) are not rooms

      const room = {
        id: row[0],
        name: row[1],
        building: row[2],
        daily: Math.round(parseFloat(row[6]) || 0),      // Column G
        weekly: Math.round(parseFloat(row[5]) || 0),     // Column F
        twoWeek: Math.round(parseFloat(row[4]) || 0),    // Column E (NEW)
        monthly: Math.round(parseFloat(row[3]) || 0),    // Column D
        active: true
      };

      rooms.push(room);
    }

    return jsonResponse({ rooms: rooms });

  } catch (err) {
    Logger.log('Error in handlePrices: ' + err.message);
    return jsonResponse({ error: err.message });
  }
}

// ============================================================
// HANDLE APPLICATION SUBMISSION
// ============================================================
function handleSubmission(data) {
  try {
    const app = data.application;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (app.eventType === 'tucker') {
      return handleTuckerSubmission(app, ss);
    }
    if (app.eventType === 'nye') {
      return handleNyeSubmission(app, ss);
    }

    let appSheet = ss.getSheetByName(APPLICATIONS_SHEET);

    // Create applications sheet if it doesn't exist
    if (!appSheet) {
      appSheet = ss.insertSheet(APPLICATIONS_SHEET);
      // Add headers
      appSheet.appendRow([
        'Timestamp',
        'Name',
        'Email',
        'Links',
        'Visited Before',
        'TC Interest',
        'Main Quest',
        'Past Quests',
        'Reference',
        'Use Time For',
        'Contribute',
        'Questions',
        'Cleanup Agreement',
        'Arrival Date',
        'Departure Date',
        'Num Days',
        'Room Name',
        'Room ID',
        'Building',
        'Room Price',
        'Price Breakdown',
        'Daily Fee',
        'Total Price',
        'Status'
      ]);
      // Format header row
      const headerRange = appSheet.getRange(1, 1, 1, 24);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f3f3f3');
    }

    // Append application to sheet
    const timestamp = new Date();
    appSheet.appendRow([
      timestamp,
      app.name,
      app.email,
      app.links || '',
      app.visited || 'no',
      app.tcInterest,
      app.mainQuest,
      app.pastQuests || '',
      app.reference || '',
      app.useTimeFor,
      app.contribute || '',
      app.questions || '',
      app.cleanupAgreement || '',
      app.arrivalDate,
      app.departureDate,
      app.numDays,
      app.roomName,
      app.roomId,
      app.building,
      app.roomPrice,
      app.priceBreakdown,
      app.dailyFee,
      app.totalPrice,
      'pending'
    ]);

    // Record booking in valley rooms calendar (in gray until approved)
    try {
      recordBookingInCalendar(app, ss);
    } catch (calendarErr) {
      Logger.log('Calendar recording failed: ' + calendarErr.message);
      // Don't fail the submission if calendar recording fails
    }

    // Optional: Send email notification
    try {
      sendApplicationNotification(app);
    } catch (emailErr) {
      Logger.log('Email notification failed: ' + emailErr.message);
      // Don't fail the submission if email fails
    }

    return jsonResponse({ success: true });

  } catch (err) {
    Logger.log('Error in handleSubmission: ' + err.message);
    return jsonResponse({ error: err.message, success: false });
  }
}

// ============================================================
// RECORD BOOKING IN CALENDAR (GRAY UNTIL APPROVED)
// ============================================================
function recordBookingInCalendar(app, ss) {
  const valleySheet = ss.getSheetByName('valley rooms');
  if (!valleySheet) {
    Logger.log('valley rooms sheet not found, skipping calendar recording');
    return;
  }

  const calendarData = valleySheet.getDataRange().getValues();

  // Row 3 (index 2) has room names, starting from column F (index 5)
  const roomRow = calendarData[2];

  // Map room ID to calendar column name(s)
  const roomIdToCalendarNames = getRoomIdToCalendarNameMapping(app.roomId);

  if (!roomIdToCalendarNames || roomIdToCalendarNames.length === 0) {
    Logger.log('No calendar mapping found for room ID: ' + app.roomId);
    return;
  }

  // Find column indices for this room
  const targetColumns = [];
  for (let col = 5; col < roomRow.length; col++) {
    const roomName = String(roomRow[col] || '').toLowerCase().trim();
    if (roomIdToCalendarNames.includes(roomName)) {
      targetColumns.push(col);
    }
  }

  if (targetColumns.length === 0) {
    Logger.log('Room columns not found in calendar for: ' + app.roomId);
    return;
  }

  // Composite rooms (the whole apartment) occupy every one of their columns.
  // Multi-capacity rooms (dorms, camping) take the first free bed/spot column.
  let writeColumns;
  if (COMPOSITE_ROOMS[app.roomId]) {
    writeColumns = targetColumns;
  } else if (targetColumns.length > 1) {
    writeColumns = [findAvailableColumn(calendarData, targetColumns, app.arrivalDate, app.departureDate)];
  } else {
    writeColumns = [targetColumns[0]];
  }

  // Find date rows and fill in booking
  const arrivalDate = new Date(app.arrivalDate);
  const departureDate = new Date(app.departureDate);
  let isFirstCell = true; // Track first cell to add note only once

  for (let row = 5; row < Math.min(calendarData.length, 1500); row++) {
    const rowData = calendarData[row];

    // Get date from columns B, C, or D
    let dateVal = null;
    for (let col = 1; col <= 3; col++) {
      if (rowData[col] instanceof Date) {
        dateVal = new Date(rowData[col]);
        break;
      }
    }

    if (!dateVal) continue;

    // Check if this date is within booking range (arrival inclusive, departure exclusive)
    if (dateVal >= arrivalDate && dateVal < departureDate) {
      for (const targetColumn of writeColumns) {
        // Write guest name in gray
        const cell = valleySheet.getRange(row + 1, targetColumn + 1); // +1 for 1-based indexing
        cell.setValue(app.name);
        cell.setFontColor('#999999'); // Light gray text

        // Only add note to the first cell
        if (isFirstCell) {
          cell.setNote('Pending approval - from application form');
          isFirstCell = false;
        }
      }
    }
  }

  Logger.log('Booking recorded in calendar for ' + app.name + ' in column(s) ' + writeColumns.join(', '));
}

// Map room IDs to calendar column names
function getRoomIdToCalendarNameMapping(roomId) {
  const mapping = {
    // Blue House
    'ensuite': ['en suite', 'en suite 2'],
    'sunny': ['sunny'],
    'normal_s': ['normal south'],
    'normal_m': ['normal middle', 'normal middle 2'],
    'normal_n': ['normal north', 'normal north 2'],
    'pool': ['pool'],
    'downstairs': ['downstairs'],
    'hallway': ['hallway 1', 'hallway 2', 'hallway 3', 'hallway 4'],
    'apartment': ['apartment a', 'apartment b'],
    'apt_a': ['apartment a'],
    'apt_b': ['apartment b'],
    'dorm_bh': ['bunk 1', 'bunk 2', 'bunk 3', 'bunk 4'],

    // Old House / Octopus
    'mcurve': ['m curve suite', 'm curve suite 2'],
    'mbig': ['m big suite', 'm big suite 2', 'm big suite 3', 'm big suite 4'],
    'mdouble': ['m double', 'm double 2'],
    'zen': ['zen 1', 'zen 2', 'zen 3', 'zen 4'],
    'studio': ['studio'],
    'galeria': ['galeria'],
    'chafariz': ['chafariz suite'],
    'library': ['library suite'],
    'isabel': ['isabel'],
    'dorm_oh': ['master bunk 1', 'master bunk 2', 'master bunk 3', 'master bunk 4', 'master bunk 5', 'master bunk 6'],

    // Camping
    'van': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    'tipi': ['1', '2', '3', '4']
  };

  return mapping[roomId] || [];
}

// Find first available column for multi-capacity rooms
function findAvailableColumn(calendarData, columnIndices, arrivalDate, departureDate) {
  const arrival = new Date(arrivalDate);
  const departure = new Date(departureDate);

  // Check each column to see if it's available for the entire date range
  for (const colIdx of columnIndices) {
    let isAvailable = true;

    for (let row = 5; row < Math.min(calendarData.length, 1500); row++) {
      const rowData = calendarData[row];

      let dateVal = null;
      for (let col = 1; col <= 3; col++) {
        if (rowData[col] instanceof Date) {
          dateVal = new Date(rowData[col]);
          break;
        }
      }

      if (!dateVal) continue;

      // Check if this date is in booking range
      if (dateVal >= arrival && dateVal < departure) {
        // Check if this column/bed is already occupied
        const cellValue = rowData[colIdx];
        if (cellValue && String(cellValue).trim().length > 0) {
          isAvailable = false;
          break;
        }
      }
    }

    if (isAvailable) {
      return colIdx; // Return first available column
    }
  }

  // If no column is completely available, use first one (will overlap, but rare case)
  return columnIndices[0];
}

// ============================================================
// SEND EMAIL NOTIFICATION (OPTIONAL)
// ============================================================
function sendApplicationNotification(app) {
  const recipient = 'theonlyfool@foolsvalley.com';
  const subject = 'New Residency Application: ' + app.name;

  const tcLabel = app.tcInterest === 'tc-primary' ? 'Yes — primary interest, joining all sessions' :
                  app.tcInterest === 'tc-no' ? 'No, not primary interest' :
                  (app.tcInterest || 'Not specified');

  const body = `
New residency application received:

============================================================
APPLICANT INFORMATION
============================================================

Name: ${app.name}
Email: ${app.email}
Links: ${app.links || 'Not provided'}

============================================================
DATES & ACCOMMODATION
============================================================

Arrival Date: ${app.arrivalDate}
Departure Date: ${app.departureDate}
Duration: ${app.numDays} days

Room: ${app.roomName}
Building: ${app.building}
Room Preference: ${app.roomPreference || 'None specified'}

============================================================
PRICING
============================================================

Room Price: €${app.roomPrice} (${app.priceBreakdown})
Daily Fee (€${Math.round(app.dailyFee / app.numDays)}/day): €${app.dailyFee}
Total Price: €${app.totalPrice}

============================================================
APPLICATION RESPONSES
============================================================

Have you already visited Fools' Valley?
${app.visited || 'no'}

Are you interested in practicing transformational connection?
${tcLabel}

Current quest (what are you working on or moving through right now?):
${app.mainQuest || 'Not specified'}

Past quests you've been on that have influenced who you are right now:
${app.pastQuests || 'Not specified'}

Do you know anyone who's been to Fools' Valley who could be your reference person?
${app.reference || 'Not specified'}

What would you like to use your time at Fools' Valley for?
${app.useTimeFor || 'Not specified'}

Would you like to host any workshops / activities / talks? What else would you like to contribute?
${app.contribute || 'Not specified'}

Anything you'd like to ask or let us know about?
${app.questions || 'Nothing'}

Do you agree to do 1-2 cleaning/cooking shifts a week, and generally keep the spaces clean and participate in collective cleanup?
${app.cleanupAgreement || 'Not specified'}

============================================================

View full application in the Applications sheet of your Google Spreadsheet.
`;

  MailApp.sendEmail(recipient, subject, body);
}

// ============================================================
// TUCKER PECK RETREAT SUBMISSION
// ============================================================
function handleTuckerSubmission(app, ss) {
  let sheet = ss.getSheetByName(TUCKER_APPLICATIONS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(TUCKER_APPLICATIONS_SHEET);
    sheet.appendRow([
      'Timestamp',            // A
      'Name',                 // B
      'Email',                // C
      'Phone',                // D
      'Emergency Contact',    // E
      'Heard From',           // F
      'Dietary',              // G
      'Mental Health',        // H
      'Code of Conduct',      // I
      'Waiver Signature',     // J
      'Payment Commitment',   // K
      'Arrival Date',         // L
      'Departure Date',       // M
      'Num Nights',           // N
      'Room Name',            // O
      'Room ID',              // P
      'Room Price',           // Q
      'Price Breakdown',      // R
      'Daily Fee',            // S
      'Total Price',          // T
      'Status'                // U (column 21)
    ]);
    const headerRange = sheet.getRange(1, 1, 1, 21);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f3f3f3');
  }

  sheet.appendRow([
    new Date(),
    app.name,
    app.email,
    app.phone || '',
    app.emergencyContact || '',
    app.heardFrom || '',
    app.dietary || '',
    app.mentalHealth || '',
    app.codeOfConduct || '',
    app.waiverSignature || '',
    app.paymentCommitment || '',
    app.arrivalDateISO,
    app.departureDateISO,
    app.numDays,
    app.roomName,
    app.roomId,
    app.roomPrice,
    app.priceBreakdown,
    app.dailyFee,
    app.totalPrice,
    'pending'
  ]);

  // Record in valley rooms calendar — except the virtual shared room (assigned manually)
  if (app.roomId && app.roomId !== 'shared_tc' && app.roomId !== 'none') {
    try {
      // ISO dates parse as UTC midnight — matches the sheet's local midnight only because
      // Jan/Feb Portugal is WET (UTC+0). Don't copy this pattern for a summer event.
      recordBookingInCalendar({
        name: app.name,
        roomId: app.roomId,
        arrivalDate: app.arrivalDateISO,
        departureDate: app.departureDateISO
      }, ss);
    } catch (calendarErr) {
      Logger.log('Tucker calendar recording failed: ' + calendarErr.message);
    }
  }

  try {
    sendTuckerNotification(app);
  } catch (emailErr) {
    Logger.log('Tucker email notification failed: ' + emailErr.message);
  }

  return jsonResponse({ success: true });
}

function buildTuckerSummary(app) {
  return `
============================================================
PARTICIPANT
============================================================

Name: ${app.name}
Email: ${app.email}
Phone: ${app.phone || 'Not provided'}
Emergency contact: ${app.emergencyContact || 'Not provided'}

============================================================
DATES & ACCOMMODATION
============================================================

Arrival: ${app.arrivalDate}
Departure: ${app.departureDate}
Duration: ${app.numDays} nights
(retreat runs Jan 29 - Feb 5, 2027; optional meditation weekend Feb 6-7)

Accommodation: ${app.roomName}${app.roomId === 'shared_tc' ? ' (room to be assigned manually)' : ''}
${app.roomPreference ? 'Accommodation preference (room selection was unavailable): ' + app.roomPreference : ''}

============================================================
PRICE BREAKDOWN
============================================================

Accommodation: €${app.roomPrice} (${app.priceBreakdown}, ${app.numDays} nights pro rata)
Daily fee (food, facilities & travel expenses of the teacher): €${app.dailyFee} (${app.numDays} days × €35)
TOTAL: €${app.totalPrice}

============================================================
APPLICATION ANSWERS
============================================================

How did you learn about the retreat?
${app.heardFrom || 'Not specified'}

Food allergies or dietary restrictions:
${app.dietary || 'None given'}

Mental health conditions:
${app.mentalHealth || 'Left blank'}

Code of conduct agreed: ${app.codeOfConduct || 'no'}

Waiver signed (typed name): ${app.waiverSignature || 'Not provided'}
(waiver: http://meditatewithtucker.com/retreat-waiver)

Payment commitment:
${app.paymentCommitment || 'Not specified'}
`;
}

function sendTuckerNotification(app) {
  const summary = buildTuckerSummary(app);

  // To fools' valley + Tucker
  try {
    MailApp.sendEmail(
      'theonlyfool@foolsvalley.com,tucker.peck@gmail.com',
      'Tucker Retreat registration: ' + app.name,
      'New registration for the meditation retreat with Tucker Peck (Jan 29 - Feb 5, 2027):\n' + summary +
      '\nFull record in the "tucker applications" tab of the booking spreadsheet.'
    );
  } catch (err) {
    Logger.log('Tucker staff email failed: ' + err.message);
  }

  // Confirmation to the participant
  try {
    MailApp.sendEmail(
      app.email,
      "Your registration — meditation retreat with Tucker Peck at fools' valley",
      'Dear ' + app.name + ',\n\n' +
      'Thank you for registering for the meditation retreat with Dr. Tucker Peck at fools\' valley (Jan 29 - Feb 5, 2027). ' +
      'Here is a copy of your registration:\n' + summary +
      '\nIf anything looks wrong, or you have any questions, just reply to this email.\n\n' +
      "fools' valley\n"
    );
  } catch (err) {
    Logger.log('Tucker participant email failed: ' + err.message);
  }
}

// ============================================================
// NEW YEAR CI FESTIVAL SUBMISSION
// ============================================================
const NYE_HEADERS = [
  'Timestamp',                   // A
  'Name',                        // B
  'Email',                       // C
  'Questions / Requests',        // D
  'Arrival Date',                // E
  'Departure Date',              // F
  'Num Nights',                  // G
  'Room Name',                   // H
  'Room ID',                     // I
  'Number of People',            // J
  'Room Price',                  // K
  'Food & Facilities',           // L
  'Facilitators Fee',            // M
  'Total Price',                 // N
  'Status',                      // O (column 15): yes / no
  'Amount Paid',                 // P
  'Facilitators Fee Passed On'   // Q
];
const NYE_STATUS_COLUMN = 15;

function getOrCreateNyeSheet(ss) {
  let sheet = ss.getSheetByName(NYE_APPLICATIONS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(NYE_APPLICATIONS_SHEET);
    sheet.appendRow(NYE_HEADERS);
    const headerRange = sheet.getRange(1, 1, 1, NYE_HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f3f3f3');
  }
  return sheet;
}

// People already booked for the festival (every row whose status is not 'no')
function nyePeopleBooked(ss) {
  const sheet = ss.getSheetByName(NYE_APPLICATIONS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, NYE_STATUS_COLUMN).getValues();
  let total = 0;
  for (const row of rows) {
    const status = String(row[NYE_STATUS_COLUMN - 1] || '').toLowerCase().trim();
    if (status === 'no' || status === 'cancelled') continue;
    total += parseInt(row[9]) || 0; // column J
  }
  return total;
}

function handleNyeSubmission(app, ss) {
  const cfg = NYE.rooms[app.roomId];
  if (!cfg && app.roomId !== 'none') {
    return jsonResponse({ success: false, error: 'That space is not available for the festival' });
  }
  const maxPeople = cfg ? (cfg.maxPeople || 1) : 2;
  const people = Math.min(maxPeople, Math.max(1, parseInt(app.people) || 1));

  // 38 people in total
  const booked = nyePeopleBooked(ss);
  if (booked + people > NYE.cap) {
    const left = Math.max(0, NYE.cap - booked);
    return jsonResponse({ success: false, soldOut: true, error: left === 0 ? 'the festival is full' : 'only ' + left + ' place' + (left === 1 ? '' : 's') + ' left' });
  }

  // Prices are decided here, not by the page
  const roomPrice = cfg ? cfg.price : 0;
  const foodFee = NYE.foodPerDay * NYE.nights * people;
  const facilitatorsFee = NYE.facilitatorsFee * people;
  const totalPrice = roomPrice + foodFee + facilitatorsFee;
  const roomName = cfg ? app.roomName : 'none';

  const sheet = getOrCreateNyeSheet(ss);
  sheet.appendRow([
    new Date(),
    app.name,
    app.email,
    (app.questions || '') + (app.roomPreference ? ' | room preference: ' + app.roomPreference : ''),
    NYE.start,
    NYE.end,
    NYE.nights,
    roomName,
    app.roomId,
    people,
    roomPrice,
    foodFee,
    facilitatorsFee,
    totalPrice,
    'pending',
    '',
    ''
  ]);

  if (cfg) {
    try {
      // ISO dates parse as UTC midnight; Dec/Jan Portugal is WET (UTC+0), so they match the sheet's local dates.
      recordBookingInCalendar({ name: app.name, roomId: app.roomId, arrivalDate: NYE.start, departureDate: NYE.end }, ss);
    } catch (calendarErr) {
      Logger.log('NYE calendar recording failed: ' + calendarErr.message);
    }
  }

  const record = { name: app.name, email: app.email, questions: app.questions || '', roomName: roomName, roomId: app.roomId,
                   roomPreference: app.roomPreference || '', people: people, roomPrice: roomPrice, foodFee: foodFee,
                   facilitatorsFee: facilitatorsFee, totalPrice: totalPrice, unit: cfg ? cfg.unit : '' };
  try {
    sendNyeNotification(record);
  } catch (emailErr) {
    Logger.log('NYE email notification failed: ' + emailErr.message);
  }

  return jsonResponse({ success: true, totalPrice: totalPrice, peopleLeft: Math.max(0, NYE.cap - booked - people) });
}

function buildNyeSummary(r) {
  return `
============================================================
PARTICIPANT
============================================================

Name: ${r.name}
Email: ${r.email}
Number of people: ${r.people}

============================================================
DATES & ACCOMMODATION
============================================================

New Year Contact Improvisation Festival
Arrival: Monday 28 December 2026
Departure: Monday 11 January 2027 (14 nights)

Accommodation: ${r.roomName}${r.unit === 'bed' ? ' (one bed)' : ''}
${r.roomPreference ? 'Accommodation preference (room selection was unavailable): ' + r.roomPreference : ''}

============================================================
PRICE
============================================================

Accommodation: €${r.roomPrice}
Food & facilities: €${r.foodFee} (${r.people} × 14 days × €${NYE.foodPerDay})
${r.facilitatorsFee ? 'Facilitators fee: €' + r.facilitatorsFee + '\n' : ''}TOTAL: €${r.totalPrice}

============================================================
QUESTIONS / REQUESTS
============================================================

${r.questions || 'None'}
`;
}

function sendNyeNotification(r) {
  const summary = buildNyeSummary(r);
  try {
    MailApp.sendEmail(
      'theonlyfool@foolsvalley.com',
      'NYE CI Festival booking request: ' + r.name + ' (' + r.people + ')',
      'New booking request for the New Year CI Festival (Dec 28, 2026 - Jan 11, 2027):\n' + summary +
      '\nFull record in the "nye applications" tab of the booking spreadsheet.'
    );
  } catch (err) {
    Logger.log('NYE staff email failed: ' + err.message);
  }
  try {
    MailApp.sendEmail(
      r.email,
      "Your request — New Year CI Festival at fools' valley",
      'Dear ' + r.name + ',\n\n' +
      "Thank you for your request for the New Year Contact Improvisation Festival at fools' valley (Dec 28, 2026 - Jan 11, 2027). " +
      'Here is a copy of it:\n' + summary +
      '\nWe will write back to confirm your place and send payment details. If anything looks wrong, just reply to this email.\n\n' +
      "fools' valley\n"
    );
  } catch (err) {
    Logger.log('NYE participant email failed: ' + err.message);
  }
}

// ============================================================
// ON EDIT TRIGGER - UPDATE CALENDAR WHEN STATUS CHANGES
// ============================================================
function onEdit(e) {
  try {
    // Add debug logging
    Logger.log('onEdit triggered');

    const sheet = e.source.getActiveSheet();
    const range = e.range;

    Logger.log('Sheet name: ' + sheet.getName());
    Logger.log('APPLICATIONS_SHEET constant: ' + APPLICATIONS_SHEET);
    Logger.log('Edited column: ' + range.getColumn());
    Logger.log('Edited row: ' + range.getRow());
    Logger.log('New value: ' + range.getValue());

    const sheetName = sheet.getName();
    // Where each applications sheet keeps its status, arrival, departure and room id (0-based indexes)
    const layouts = {};
    layouts[APPLICATIONS_SHEET] = { status: 24, arrival: 12, departure: 13, room: 16 };
    layouts[TUCKER_APPLICATIONS_SHEET] = { status: 21, arrival: 11, departure: 12, room: 15 };
    layouts[NYE_APPLICATIONS_SHEET] = { status: NYE_STATUS_COLUMN, arrival: 4, departure: 5, room: 8 };
    const layout = layouts[sheetName];
    if (!layout) {
      Logger.log('Not an applications sheet, exiting');
      return;
    }

    const isTucker = sheetName === TUCKER_APPLICATIONS_SHEET;
    const statusColumn = layout.status;
    if (range.getColumn() !== statusColumn) {
      Logger.log('Not status column (expected ' + statusColumn + '), exiting');
      return;
    }

    const row = range.getRow();
    if (row === 1) {
      Logger.log('Header row, exiting');
      return;
    }

    const newStatus = range.getValue().toString().toLowerCase().trim();
    Logger.log('Status value (trimmed): "' + newStatus + '"');

    // Get application data from this row
    const appData = sheet.getRange(row, 1, 1, statusColumn).getValues()[0];
    const applicantName = appData[1];                        // Column B: Name (both sheets)
    const arrivalDate = appData[layout.arrival];
    const departureDate = appData[layout.departure];
    const roomId = appData[layout.room];

    Logger.log('Applicant: ' + applicantName);
    Logger.log('Arrival: ' + arrivalDate);
    Logger.log('Departure: ' + departureDate);
    Logger.log('Room ID (column Q): ' + roomId);

    // Shared room isn't in the calendar — nothing to update
    if (isTucker && roomId === 'shared_tc') {
      Logger.log('Shared room booking - no calendar entry to update');
      return;
    }

    if (!applicantName || !arrivalDate || !departureDate || !roomId) {
      Logger.log('Missing required data for calendar update');
      return;
    }

    const ss = e.source;

    if (newStatus === 'yes') {
      // Approve booking: Change text color to black
      Logger.log('Approving booking...');
      updateBookingColor(ss, applicantName, arrivalDate, departureDate, roomId, '#000000');
      Logger.log('Booking approved for ' + applicantName);
    } else if (newStatus === 'no') {
      // Reject booking: Remove from calendar
      Logger.log('Removing booking...');
      removeBookingFromCalendar(ss, applicantName, arrivalDate, departureDate, roomId);
      Logger.log('Booking removed for ' + applicantName);
    } else {
      Logger.log('Status is neither yes nor no: "' + newStatus + '"');
    }

  } catch (err) {
    Logger.log('ERROR in onEdit trigger: ' + err.message);
    Logger.log('Stack trace: ' + err.stack);
  }
}

// ============================================================
// UPDATE BOOKING COLOR IN CALENDAR
// ============================================================
function updateBookingColor(ss, applicantName, arrivalDate, departureDate, roomId, color) {
  Logger.log('=== updateBookingColor START ===');
  Logger.log('Looking for: ' + applicantName);
  Logger.log('Room ID: ' + roomId);
  Logger.log('Dates: ' + arrivalDate + ' to ' + departureDate);

  const valleySheet = ss.getSheetByName('valley rooms');
  if (!valleySheet) {
    Logger.log('ERROR: valley rooms sheet not found');
    return;
  }

  const calendarData = valleySheet.getDataRange().getValues();
  const roomRow = calendarData[2];

  // Map room ID to calendar column name(s)
  const roomIdToCalendarNames = getRoomIdToCalendarNameMapping(roomId);
  Logger.log('Expected calendar column names: ' + JSON.stringify(roomIdToCalendarNames));

  if (!roomIdToCalendarNames || roomIdToCalendarNames.length === 0) {
    Logger.log('ERROR: No calendar mapping found for room ID: ' + roomId);
    return;
  }

  // Find column indices for this room
  const targetColumns = [];
  for (let col = 5; col < roomRow.length; col++) {
    const roomName = String(roomRow[col] || '').toLowerCase().trim();
    if (roomIdToCalendarNames.includes(roomName)) {
      targetColumns.push(col);
      Logger.log('Found matching column at index ' + col + ': ' + roomName);
    }
  }

  if (targetColumns.length === 0) {
    Logger.log('ERROR: Room columns not found in calendar');
    Logger.log('Available columns: ' + roomRow.slice(5, 30).join(', '));
    return;
  }

  // Convert dates to Date objects
  const arrival = new Date(arrivalDate);
  const departure = new Date(departureDate);
  Logger.log('Date range: ' + arrival.toDateString() + ' to ' + departure.toDateString());

  let cellsUpdated = 0;

  // Find and update cells with matching name and dates
  for (let row = 5; row < Math.min(calendarData.length, 1500); row++) {
    const rowData = calendarData[row];

    // Get date from columns B, C, or D
    let dateVal = null;
    for (let col = 1; col <= 3; col++) {
      if (rowData[col] instanceof Date) {
        dateVal = new Date(rowData[col]);
        break;
      }
    }

    if (!dateVal) continue;

    // Check if this date is within booking range
    if (dateVal >= arrival && dateVal < departure) {
      // Check each target column for matching name
      for (const colIdx of targetColumns) {
        const cellValue = String(rowData[colIdx] || '').trim();
        if (cellValue === applicantName) {
          // Update color and clear note
          const cell = valleySheet.getRange(row + 1, colIdx + 1);
          cell.setFontColor(color);
          cell.clearNote();
          cellsUpdated++;
          Logger.log('Updated cell at row ' + (row + 1) + ', col ' + (colIdx + 1) + ' (' + dateVal.toDateString() + ')');
        }
      }
    }
  }

  Logger.log('Total cells updated: ' + cellsUpdated);
  if (cellsUpdated === 0) {
    Logger.log('WARNING: No cells were updated. Name might not match exactly.');
    Logger.log('Looking for exact match: "' + applicantName + '"');
  }
  Logger.log('=== updateBookingColor END ===');
}

// ============================================================
// REMOVE BOOKING FROM CALENDAR
// ============================================================
function removeBookingFromCalendar(ss, applicantName, arrivalDate, departureDate, roomId) {
  Logger.log('=== removeBookingFromCalendar START ===');
  Logger.log('Looking for: ' + applicantName);
  Logger.log('Room ID: ' + roomId);
  Logger.log('Dates: ' + arrivalDate + ' to ' + departureDate);

  const valleySheet = ss.getSheetByName('valley rooms');
  if (!valleySheet) {
    Logger.log('ERROR: valley rooms sheet not found');
    return;
  }

  const calendarData = valleySheet.getDataRange().getValues();
  const roomRow = calendarData[2];

  // Map room ID to calendar column name(s)
  const roomIdToCalendarNames = getRoomIdToCalendarNameMapping(roomId);
  Logger.log('Expected calendar column names: ' + JSON.stringify(roomIdToCalendarNames));

  if (!roomIdToCalendarNames || roomIdToCalendarNames.length === 0) {
    Logger.log('ERROR: No calendar mapping found for room ID: ' + roomId);
    return;
  }

  // Find column indices for this room
  const targetColumns = [];
  for (let col = 5; col < roomRow.length; col++) {
    const roomName = String(roomRow[col] || '').toLowerCase().trim();
    if (roomIdToCalendarNames.includes(roomName)) {
      targetColumns.push(col);
      Logger.log('Found matching column at index ' + col + ': ' + roomName);
    }
  }

  if (targetColumns.length === 0) {
    Logger.log('ERROR: Room columns not found in calendar');
    Logger.log('Available columns: ' + roomRow.slice(5, 30).join(', '));
    return;
  }

  // Convert dates to Date objects
  const arrival = new Date(arrivalDate);
  const departure = new Date(departureDate);
  Logger.log('Date range: ' + arrival.toDateString() + ' to ' + departure.toDateString());

  let cellsCleared = 0;

  // Find and clear cells with matching name and dates
  for (let row = 5; row < Math.min(calendarData.length, 1500); row++) {
    const rowData = calendarData[row];

    // Get date from columns B, C, or D
    let dateVal = null;
    for (let col = 1; col <= 3; col++) {
      if (rowData[col] instanceof Date) {
        dateVal = new Date(rowData[col]);
        break;
      }
    }

    if (!dateVal) continue;

    // Check if this date is within booking range
    if (dateVal >= arrival && dateVal < departure) {
      // Check each target column for matching name
      for (const colIdx of targetColumns) {
        const cellValue = String(rowData[colIdx] || '').trim();
        if (cellValue === applicantName) {
          // Clear the cell
          const cell = valleySheet.getRange(row + 1, colIdx + 1);
          cell.clear();
          cellsCleared++;
          Logger.log('Cleared cell at row ' + (row + 1) + ', col ' + (colIdx + 1) + ' (' + dateVal.toDateString() + ')');
        }
      }
    }
  }

  Logger.log('Total cells cleared: ' + cellsCleared);
  if (cellsCleared === 0) {
    Logger.log('WARNING: No cells were cleared. Name might not match exactly.');
    Logger.log('Looking for exact match: "' + applicantName + '"');
  }
  Logger.log('=== removeBookingFromCalendar END ===');
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// DEBUG FUNCTION - Run this manually to test the trigger logic
// ============================================================
function testStatusUpdate() {
  // INSTRUCTIONS:
  // 1. Update the values below to match a real application in your sheet
  // 2. Run this function from the Apps Script editor
  // 3. Check the Execution log (View → Logs or Ctrl+Enter after running)

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const appSheet = ss.getSheetByName(APPLICATIONS_SHEET);

  // Get the first application row (row 2, assuming row 1 is header)
  const testRow = 2;
  const appData = appSheet.getRange(testRow, 1, 1, 24).getValues()[0];

  Logger.log('=== TEST STATUS UPDATE ===');
  Logger.log('Testing with row ' + testRow);
  Logger.log('Name: ' + appData[1]);
  Logger.log('Arrival: ' + appData[13]);
  Logger.log('Departure: ' + appData[14]);
  Logger.log('Room ID: ' + appData[17]);

  const applicantName = appData[1];
  const arrivalDate = appData[13];
  const departureDate = appData[14];
  const roomId = appData[17];

  if (!applicantName || !arrivalDate || !departureDate || !roomId) {
    Logger.log('ERROR: Missing required data in row ' + testRow);
    return;
  }

  // Test approval (change to black)
  Logger.log('Testing APPROVAL (black text)...');
  updateBookingColor(ss, applicantName, arrivalDate, departureDate, roomId, '#000000');
  Logger.log('Approval test complete. Check valley rooms sheet.');

  // Uncomment below to test rejection (removal)
  // Logger.log('Testing REJECTION (remove booking)...');
  // removeBookingFromCalendar(ss, applicantName, arrivalDate, departureDate, roomId);
  // Logger.log('Rejection test complete. Check valley rooms sheet.');
}
