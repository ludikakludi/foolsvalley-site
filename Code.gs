// ============================================================
// FOOLS' VALLEY RESIDENCY APPLICATION BACKEND
// Google Apps Script for handling room availability & applications
// ============================================================

// Configuration - Update these sheet names to match your Google Sheet
const ROOMS_SHEET = 'prices';  // This has room data: IDs, names, buildings, daily/weekly/monthly rates
const BOOKINGS_SHEET = 'bookings';  // Will be created if it doesn't exist
const APPLICATIONS_SHEET = 'applications';  // Will be created automatically

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
  // Simple tier pricing:
  // 1-6 days: Daily rate (numDays × daily)
  // 7-13 days: Weekly flat rate
  // 14-29 days: 2-week flat rate
  // 30+ days: Monthly rate prorated (monthly ÷ 30.5 × numDays)

  let roomPrice, priceBreakdown;

  if (numDays >= 30) {
    // 30+ days: Prorated monthly rate
    roomPrice = Math.round((monthlyRate / 30.5) * numDays);
    priceBreakdown = '€' + monthlyRate + '/month';
  } else if (numDays >= 14) {
    // 14-29 days: Flat 2-week rate
    roomPrice = twoWeekRate;
    priceBreakdown = '€' + twoWeekRate + '/2 weeks';
  } else if (numDays >= 7) {
    // 7-13 days: Flat weekly rate
    roomPrice = weeklyRate;
    priceBreakdown = '€' + weeklyRate + '/week';
  } else {
    // 1-6 days: Daily rate
    roomPrice = Math.round(numDays * dailyRate);
    priceBreakdown = '€' + dailyRate + '/day';
  }

  return {
    roomPrice: roomPrice,
    priceBreakdown: priceBreakdown
  };
}

// ============================================================
// HANDLE AVAILABILITY REQUEST
// ============================================================
function handleAvailability(e) {
  try {
    const from = e.parameter.from; // ISO format: YYYY-MM-DD
    const to = e.parameter.to;

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
        const roomNameLower = room.name.toLowerCase().trim();
        roomNameToId[roomNameLower] = room.id;

        // Map calendar names to room IDs
        // Octopus House
        if (room.id === 'mcurve') roomNameToId['m curve suite'] = room.id;
        if (room.id === 'mbig') roomNameToId['m big suite'] = room.id;
        if (room.id === 'mdouble') roomNameToId['m double'] = room.id;

        // Old House
        if (room.id === 'studio') roomNameToId['studio'] = room.id;
        if (room.id === 'galeria') roomNameToId['galeria'] = room.id;
        if (room.id === 'chafariz') roomNameToId['chafariz suite'] = room.id;
        if (room.id === 'library') roomNameToId['library suite'] = room.id;
        if (room.id === 'isabel') roomNameToId['isabel'] = room.id;
        if (room.id === 'dorm_oh') {
          roomNameToId['master bunk 1'] = room.id;
          roomNameToId['master bunk 2'] = room.id;
          roomNameToId['master bunk 3'] = room.id;
          roomNameToId['master bunk 4'] = room.id;
          roomNameToId['master bunk 5'] = room.id;
          roomNameToId['master bunk 6'] = room.id;
        }

        // Blue House
        if (room.id === 'ensuite') roomNameToId['en suite'] = room.id;
        if (room.id === 'sunny') roomNameToId['sunny'] = room.id;
        if (room.id === 'normal_s') roomNameToId['normal south'] = room.id;
        if (room.id === 'normal_m') roomNameToId['normal middle'] = room.id;
        if (room.id === 'normal_n') roomNameToId['normal north'] = room.id;
        if (room.id === 'pool') roomNameToId['pool'] = room.id;
        if (room.id === 'downstairs') roomNameToId['downstairs'] = room.id;
        if (room.id === 'apartment') roomNameToId['apartment'] = room.id;
        if (room.id === 'dorm_bh') {
          roomNameToId['bunk 1'] = room.id;
          roomNameToId['bunk 2'] = room.id;
          roomNameToId['bunk 3'] = room.id;
          roomNameToId['bunk 4'] = room.id;
        }

        // Camping
        if (room.id === 'van') {
          roomNameToId['a'] = room.id;
          roomNameToId['b'] = room.id;
          roomNameToId['c'] = room.id;
          roomNameToId['d'] = room.id;
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

    // Check availability and calculate prices
    const availableRooms = [];

    for (const room of rooms) {
      const available = checkRoomAvailability(room, bookings, fromDate, toDate);

      if (available.isAvailable) {
        // Calculate pricing using correct logic
        const pricing = calculateRoomPrice(room.daily, room.weekly, room.twoWeek, room.monthly, numDays);

        // Calculate daily fee (€20/day per person)
        const dailyFee = numDays * 20;
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
          availableCount: available.availableCount
        });
      }
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
function checkRoomAvailability(room, bookings, fromDate, toDate) {
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

  // For each day, count bookings
  let maxBookedOnAnyDay = 0;
  for (const dateStr of requestedDates) {
    let bookedOnThisDay = 0;
    for (const booking of bookings) {
      if (booking.roomId === room.id) {
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
    let appSheet = ss.getSheetByName(APPLICATIONS_SHEET);

    // Create applications sheet if it doesn't exist
    if (!appSheet) {
      appSheet = ss.insertSheet(APPLICATIONS_SHEET);
      // Add headers
      appSheet.appendRow([
        'Timestamp',
        'Name',
        'Email',
        'Visited Before',
        'TC Interest',
        'Main Quest',
        'Past Quests',
        'Reference',
        'Use Time For',
        'Contribute',
        'Ideal Day',
        'Questions',
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
        'Room Preference',
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
      app.visited || 'no',
      app.tcInterest,
      app.mainQuest,
      app.pastQuests || '',
      app.reference || '',
      app.useTimeFor,
      app.contribute || '',
      app.idealDay || '',
      app.questions || '',
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
      app.roomPreference || '',
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

  // For multi-capacity rooms, find first available column
  let targetColumn = targetColumns[0];
  if (targetColumns.length > 1) {
    // Check which bed/spot is available during this date range
    targetColumn = findAvailableColumn(calendarData, targetColumns, app.arrivalDate, app.departureDate);
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

  Logger.log('Booking recorded in calendar for ' + app.name + ' in column ' + targetColumn);
}

// Map room IDs to calendar column names
function getRoomIdToCalendarNameMapping(roomId) {
  const mapping = {
    // Blue House
    'ensuite': ['en suite'],
    'sunny': ['sunny'],
    'normal_s': ['normal south'],
    'normal_m': ['normal middle'],
    'normal_n': ['normal north'],
    'pool': ['pool'],
    'downstairs': ['downstairs'],
    'apartment': ['apartment'],
    'dorm_bh': ['bunk 1', 'bunk 2', 'bunk 3', 'bunk 4'],

    // Old House / Octopus
    'mcurve': ['m curve suite'],
    'mbig': ['m big suite'],
    'mdouble': ['m double'],
    'studio': ['studio'],
    'galeria': ['galeria'],
    'chafariz': ['chafariz suite'],
    'library': ['library suite'],
    'isabel': ['isabel'],
    'dorm_oh': ['master bunk 1', 'master bunk 2', 'master bunk 3', 'master bunk 4', 'master bunk 5', 'master bunk 6'],

    // Camping
    'van': ['a', 'b', 'c', 'd'],
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

  const body = `
New residency application received:

============================================================
APPLICANT INFORMATION
============================================================

Name: ${app.name}
Email: ${app.email}

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
Daily Fee (€20/day): €${app.dailyFee}
Total Price: €${app.totalPrice}

============================================================
APPLICATION RESPONSES
============================================================

Have you visited Fools' Valley before?
${app.visited || 'no'}

Are you interested in joining our Temporary Community (TC)?
${app.tcInterest || 'Not specified'}

What is your main quest?
${app.mainQuest || 'Not specified'}

What were your past quests?
${app.pastQuests || 'Not specified'}

How did you hear about us / Who referred you?
${app.reference || 'Not specified'}

What will you use your time at Fools' Valley for?
${app.useTimeFor || 'Not specified'}

How do you want to contribute to the community and the place?
${app.contribute || 'Not specified'}

What would your ideal day at Fools' Valley look like?
${app.idealDay || 'Not specified'}

Do you have any questions for us?
${app.questions || 'No questions'}

============================================================

View full application in the Applications sheet of your Google Spreadsheet.
`;

  MailApp.sendEmail(recipient, subject, body);
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
