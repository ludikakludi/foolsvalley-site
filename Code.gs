// ============================================================
// FOOLS' VALLEY RESIDENCY APPLICATION BACKEND
// Google Apps Script for handling room availability & applications
// ============================================================

// Configuration - Update these sheet names to match your Google Sheet
const ROOMS_SHEET = 'prices';  // This has room data: IDs, names, buildings, daily/weekly/monthly rates
const BOOKINGS_SHEET = 'bookings';  // Will be created if it doesn't exist
const APPLICATIONS_SHEET = 'applications';  // Will be created automatically
const TUCKER_APPLICATIONS_SHEET = 'tucker applications';

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
  }
  // Add more event blocks here as needed
];

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

    // Tucker retreat: dorms are offered with retreat-specific labels
    if (eventParam === 'tucker') {
      for (const room of rooms) {
        if (room.id === 'dorm_oh') room.name = 'Male dorm';
        if (room.id === 'dorm_bh') room.name = 'Mixed dorm';
      }
    }

    // Check availability and calculate prices
    const availableRooms = [];

    for (const room of rooms) {
      // Tucker retreat: no camping/tipi/van in January
      if (eventParam === 'tucker' && (room.building === 'Camping' || room.id === 'van' || room.id === 'tipi')) {
        continue;
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
        } else {
          pricing = calculateRoomPrice(room.daily, room.weekly, room.twoWeek, room.monthly, numDays);
          dailyFee = numDays * 20;
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
          availableCount: available.availableCount
        });
      }
    }

    // Tucker retreat: virtual "shared room" option, assigned manually — always offered
    if (eventParam === 'tucker') {
      const sharedPrice = Math.round((200 / 7) * numDays);
      const sharedFee = numDays * 35;
      availableRooms.push({
        id: 'shared_tc',
        name: 'Shared room (2 people)',
        building: 'Blue House',
        desc: "a bed in a double room shared with one other retreatant (gender segregated or share with a friend) — we'll assign the specific room",
        photo: '',
        roomPrice: sharedPrice,
        priceBreakdown: '€200/week',
        dailyFee: sharedFee,
        totalPrice: sharedPrice + sharedFee,
        numDays: numDays,
        availableCount: 2
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

    if (app.eventType === 'tucker') {
      return handleTuckerSubmission(app, ss);
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
Daily Fee (€20/day): €${app.dailyFee}
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
    if (sheetName !== APPLICATIONS_SHEET && sheetName !== TUCKER_APPLICATIONS_SHEET) {
      Logger.log('Not an applications sheet, exiting');
      return;
    }

    const isTucker = sheetName === TUCKER_APPLICATIONS_SHEET;

    // Status column: X (24) for residency applications, U (21) for tucker applications
    const statusColumn = isTucker ? 21 : 24;
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
    const arrivalDate = isTucker ? appData[11] : appData[12];   // tucker: L / residency: M
    const departureDate = isTucker ? appData[12] : appData[13]; // tucker: M / residency: N
    const roomId = isTucker ? appData[15] : appData[16];        // tucker: P / residency: Q

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
