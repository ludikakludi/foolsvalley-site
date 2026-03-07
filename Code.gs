// ============================================================
// FOOLS' VALLEY RESIDENCY APPLICATION BACKEND
// Google Apps Script for handling room availability & applications
// ============================================================

// Configuration - Update these sheet names to match your Google Sheet
const ROOMS_SHEET = 'valley rooms';
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
// PRICING CALCULATION - CORRECTED LOGIC
// ============================================================
function calculateRoomPrice(dailyRate, weeklyRate, monthlyRate, numDays) {
  let roomPrice, priceBreakdown;

  // Pricing logic per requirements:
  // >= 28 days: monthly rate ÷ 30.5 × days
  // < 28 days: compare (monthly rate) vs (weekly daily rate × days), use cheaper

  if (numDays >= 28) {
    // Use monthly rate, prorated by 30.5 days per month
    roomPrice = Math.round((monthlyRate / 30.5) * numDays);
    priceBreakdown = '€' + monthlyRate + '/month';
  } else {
    // Calculate what it would cost using weekly rate
    const weeklyDailyRate = weeklyRate / 7;
    const weeklyTotal = Math.round(weeklyDailyRate * numDays);

    // Compare monthly vs weekly pricing
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

    // Get bookings sheet, or create it if it doesn't exist
    let bookingsSheet = ss.getSheetByName(BOOKINGS_SHEET);
    let bookings = [];

    if (!bookingsSheet) {
      // Create bookings sheet with headers
      bookingsSheet = ss.insertSheet(BOOKINGS_SHEET);
      bookingsSheet.appendRow(['Room ID', 'Arrival Date', 'Departure Date', 'Status']);
      const headerRange = bookingsSheet.getRange(1, 1, 1, 4);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f3f3f3');
      // Add example row (optional - remove if you don't want it)
      // bookingsSheet.appendRow(['oct-1', new Date('2026-03-01'), new Date('2026-03-15'), 'confirmed']);
    } else {
      // Parse bookings if sheet exists and has data
      const bookingsData = bookingsSheet.getDataRange().getValues();
      for (let i = 1; i < bookingsData.length; i++) {
        const row = bookingsData[i];
        if (!row[0]) continue;
        bookings.push({
          roomId: row[0],
          arrivalDate: new Date(row[1]),
          departureDate: new Date(row[2]),
          status: row[3] || 'confirmed'
        });
      }
    }

    // Get all rooms data
    const roomsData = roomsSheet.getDataRange().getValues();
    const roomsHeaders = roomsData[0];
    const rooms = [];

    // Parse rooms (skip header row)
    for (let i = 1; i < roomsData.length; i++) {
      const row = roomsData[i];
      if (!row[0]) continue; // Skip empty rows

      const room = {
        id: row[0],
        name: row[1],
        building: row[2],
        desc: row[3] || '',
        photo: row[4] || '',
        capacity: parseInt(row[5]) || 1,
        daily: parseFloat(row[6]) || 0,
        weekly: parseFloat(row[7]) || 0,
        monthly: parseFloat(row[8]) || 0,
        active: row[9] !== false && row[9] !== 'FALSE' // Active by default
      };

      if (room.active) {
        rooms.push(room);
      }
    }

    // Check availability and calculate prices
    const availableRooms = [];

    for (const room of rooms) {
      const available = checkRoomAvailability(room, bookings, fromDate, toDate);

      if (available.isAvailable) {
        // Calculate pricing using correct logic
        const pricing = calculateRoomPrice(room.daily, room.weekly, room.monthly, numDays);

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
// CHECK ROOM AVAILABILITY
// ============================================================
function checkRoomAvailability(room, bookings, fromDate, toDate) {
  // Count how many bookings conflict with this date range
  let bookedCount = 0;

  for (const booking of bookings) {
    if (booking.roomId === room.id && booking.status !== 'cancelled') {
      // Check if dates overlap
      if (booking.arrivalDate < toDate && booking.departureDate > fromDate) {
        bookedCount++;
      }
    }
  }

  const availableCount = room.capacity - bookedCount;
  const isAvailable = availableCount > 0;

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
    for (let i = 1; i < roomsData.length; i++) {
      const row = roomsData[i];
      if (!row[0]) continue; // Skip empty rows

      const room = {
        id: row[0],
        name: row[1],
        building: row[2],
        daily: Math.round(parseFloat(row[6]) || 0),
        weekly: Math.round(parseFloat(row[7]) || 0),
        monthly: Math.round(parseFloat(row[8]) || 0),
        active: row[9] !== false && row[9] !== 'FALSE'
      };

      if (room.active) {
        rooms.push(room);
      }
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
