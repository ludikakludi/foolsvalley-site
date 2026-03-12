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
// PRICING CALCULATION - WITH 2-WEEK RATE
// ============================================================
function calculateRoomPrice(dailyRate, weeklyRate, twoWeekRate, monthlyRate, numDays) {
  let roomPrice, priceBreakdown;

  // Pricing logic:
  // >= 28 days: monthly rate ÷ 30.5 × days
  // >= 14 days and < 28 days: compare (2-week prorated) vs (weekly prorated) vs (monthly flat)
  // < 14 days: compare (weekly prorated) vs (monthly flat)

  if (numDays >= 28) {
    // Use monthly rate, prorated by 30.5 days per month
    roomPrice = Math.round((monthlyRate / 30.5) * numDays);
    priceBreakdown = '€' + monthlyRate + '/month';
  } else if (numDays >= 14) {
    // Calculate all three options
    const twoWeekDailyRate = twoWeekRate / 14;
    const twoWeekTotal = Math.round(twoWeekDailyRate * numDays);

    const weeklyDailyRate = weeklyRate / 7;
    const weeklyTotal = Math.round(weeklyDailyRate * numDays);

    // Compare all three: two-week prorated, weekly prorated, monthly flat
    const options = [
      { price: twoWeekTotal, breakdown: '€' + twoWeekRate + '/2 weeks', rate: twoWeekRate },
      { price: weeklyTotal, breakdown: '€' + weeklyRate + '/week', rate: weeklyRate },
      { price: monthlyRate, breakdown: '€' + monthlyRate + '/month', rate: monthlyRate }
    ];

    // Find the cheapest option
    const cheapest = options.reduce((min, opt) => opt.price < min.price ? opt : min);
    roomPrice = cheapest.price;
    priceBreakdown = cheapest.breakdown;
  } else {
    // < 14 days: compare weekly vs monthly
    const weeklyDailyRate = weeklyRate / 7;
    const weeklyTotal = Math.round(weeklyDailyRate * numDays);

    if (monthlyRate <= weeklyTotal) {
      // Monthly is cheaper or equal - charge full monthly price
      roomPrice = monthlyRate;
      priceBreakdown = '€' + monthlyRate + '/month';
    } else {
      // Weekly pricing is cheaper
      roomPrice = weeklyTotal;
      priceBreakdown = '€' + weeklyRate + '/week';
    }
  }

  return { roomPrice, priceBreakdown };
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

      // Determine capacity based on room type
      let capacity = 1;  // Default for private rooms
      const roomName = row[1] || '';
      const roomId = row[0] || '';

      // Dorms have multiple beds
      if (roomName.toLowerCase().includes('dorm') || roomId.includes('dorm')) {
        capacity = 6;  // Adjust this number as needed for each dorm
      }
      // Camping spots can have multiple spaces
      if (row[2] === 'Camping' || roomName.toLowerCase().includes('tent') || roomName.toLowerCase().includes('van')) {
        capacity = 10;  // Multiple camping spots
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
  // Check if ANY day in the requested range is booked

  // Get all dates in the requested range
  const requestedDates = [];
  for (let d = new Date(fromDate); d < toDate; d.setDate(d.getDate() + 1)) {
    requestedDates.push(d.toISOString().split('T')[0]);
  }

  // Count how many of those dates are booked for this room
  let bookedDays = 0;
  for (const booking of bookings) {
    if (booking.roomId === room.id) {
      const bookingDate = new Date(booking.date).toISOString().split('T')[0];
      if (requestedDates.includes(bookingDate)) {
        bookedDays++;
      }
    }
  }

  // If the room has capacity > 1 (dorms), it might still be available
  // For single-capacity rooms, any booked day means unavailable
  const isFullyBooked = (room.capacity === 1 && bookedDays > 0);
  const availableCount = isFullyBooked ? 0 : room.capacity;
  const isAvailable = !isFullyBooked;

  // Generate display name for multi-capacity rooms
  let displayName = room.name;
  if (room.capacity > 1) {
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
// SEND EMAIL NOTIFICATION (OPTIONAL)
// ============================================================
function sendApplicationNotification(app) {
  const recipient = 'theonlyfool@foolsvalley.com';
  const subject = 'New Residency Application: ' + app.name;

  const body = `
New residency application received:

Name: ${app.name}
Email: ${app.email}
Arrival: ${app.arrivalDate}
Departure: ${app.departureDate}
Duration: ${app.numDays} days

Room: ${app.roomName}
Building: ${app.building}
Total Price: €${app.totalPrice}

Main Quest: ${app.mainQuest}

View full application in the Applications sheet.
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
