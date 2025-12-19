import { Namespace, Socket } from 'socket.io';
import { VehicleStats, DiagnosticCode, Vehicle } from '../../models';
import { IVehicleStats, IDiagnosticCode } from '../../types';

interface JoinVehiclePayload {
  vehicleId: string;
  userId?: string;
}

interface StatsUpdatePayload {
  vehicleId: string;
  stats: Partial<IVehicleStats>;
}

interface CodePayload {
  vehicleId: string;
  code: Partial<IDiagnosticCode>;
}

export const obdHandler = (namespace: Namespace, socket: Socket) => {
  // Join a vehicle room to receive updates
  socket.on('join-vehicle', async (payload: JoinVehiclePayload) => {
    const { vehicleId } = payload;

    if (!vehicleId) {
      socket.emit('error', { message: 'Vehicle ID is required' });
      return;
    }

    // Leave any existing vehicle rooms
    const rooms = Array.from(socket.rooms);
    for (const room of rooms) {
      if (room !== socket.id && room.startsWith('vehicle:')) {
        socket.leave(room);
      }
    }

    // Join the new vehicle room
    const roomName = `vehicle:${vehicleId}`;
    socket.join(roomName);

    console.log(`[OBD] ${socket.id} joined room ${roomName}`);

    socket.emit('joined-vehicle', { vehicleId, roomName });

    // Send last known stats if available
    try {
      const lastStats = await VehicleStats.findOne({ vehicleId })
        .sort({ timestamp: -1 })
        .lean();

      if (lastStats) {
        socket.emit('initial-stats', lastStats);
      }

      // Send active diagnostic codes
      const activeCodes = await DiagnosticCode.find({
        vehicleId,
        isActive: true
      }).lean();

      if (activeCodes.length > 0) {
        socket.emit('active-codes', activeCodes);
      }
    } catch (error) {
      console.error('[OBD] Error fetching initial data:', error);
    }
  });

  // Leave a vehicle room
  socket.on('leave-vehicle', (payload: { vehicleId: string }) => {
    const { vehicleId } = payload;
    const roomName = `vehicle:${vehicleId}`;

    socket.leave(roomName);
    console.log(`[OBD] ${socket.id} left room ${roomName}`);

    socket.emit('left-vehicle', { vehicleId });
  });

  // Receive stats update from OBD device (or simulator)
  socket.on('stats-update', async (payload: StatsUpdatePayload) => {
    const { vehicleId, stats } = payload;

    if (!vehicleId || !stats) {
      socket.emit('error', { message: 'Vehicle ID and stats are required' });
      return;
    }

    try {
      // Save stats to database
      const vehicleStats = new VehicleStats({
        vehicleId,
        ...stats,
        timestamp: new Date(),
      });
      await vehicleStats.save();

      // Update vehicle's last known stats
      await Vehicle.findByIdAndUpdate(vehicleId, {
        lastOBDSync: new Date(),
      });

      // Broadcast to all clients in the vehicle room
      const roomName = `vehicle:${vehicleId}`;
      namespace.to(roomName).emit('stats-update', {
        vehicleId,
        stats: vehicleStats.toJSON(),
      });

      // Check for warning conditions and emit alerts
      const alerts = checkForAlerts(stats);
      if (alerts.length > 0) {
        namespace.to(roomName).emit('alerts', { vehicleId, alerts });
      }
    } catch (error) {
      console.error('[OBD] Error saving stats:', error);
      socket.emit('error', { message: 'Failed to save stats' });
    }
  });

  // New diagnostic code detected
  socket.on('code-detected', async (payload: CodePayload) => {
    const { vehicleId, code } = payload;

    if (!vehicleId || !code || !code.code) {
      socket.emit('error', { message: 'Vehicle ID and code details are required' });
      return;
    }

    try {
      // Check if code already exists and is active
      const existingCode = await DiagnosticCode.findOne({
        vehicleId,
        code: code.code,
        isActive: true,
      });

      if (existingCode) {
        socket.emit('code-exists', { vehicleId, code: existingCode.toJSON() });
        return;
      }

      // Create new diagnostic code
      const diagnosticCode = new DiagnosticCode({
        vehicleId,
        ...code,
        detectedAt: new Date(),
        isActive: true,
      });
      await diagnosticCode.save();

      // Update vehicle health status based on severity
      if (code.severity === 'critical') {
        await Vehicle.findByIdAndUpdate(vehicleId, { healthStatus: 'critical' });
      } else if (code.severity === 'warning') {
        await Vehicle.findByIdAndUpdate(vehicleId, { healthStatus: 'warning' });
      }

      // Broadcast to all clients in the vehicle room
      const roomName = `vehicle:${vehicleId}`;
      namespace.to(roomName).emit('code-detected', {
        vehicleId,
        code: diagnosticCode.toJSON(),
      });
    } catch (error) {
      console.error('[OBD] Error saving diagnostic code:', error);
      socket.emit('error', { message: 'Failed to save diagnostic code' });
    }
  });

  // Diagnostic code cleared
  socket.on('code-cleared', async (payload: { vehicleId: string; codeId: string }) => {
    const { vehicleId, codeId } = payload;

    if (!vehicleId || !codeId) {
      socket.emit('error', { message: 'Vehicle ID and code ID are required' });
      return;
    }

    try {
      // Mark code as cleared
      const diagnosticCode = await DiagnosticCode.findByIdAndUpdate(
        codeId,
        {
          isActive: false,
          clearedAt: new Date(),
        },
        { new: true }
      );

      if (!diagnosticCode) {
        socket.emit('error', { message: 'Diagnostic code not found' });
        return;
      }

      // Check if there are any remaining critical/warning codes
      const remainingCodes = await DiagnosticCode.find({
        vehicleId,
        isActive: true,
      }).sort({ severity: 1 });

      // Update vehicle health status
      let newHealthStatus: 'good' | 'warning' | 'critical' = 'good';
      if (remainingCodes.some(c => c.severity === 'critical')) {
        newHealthStatus = 'critical';
      } else if (remainingCodes.some(c => c.severity === 'warning')) {
        newHealthStatus = 'warning';
      }

      await Vehicle.findByIdAndUpdate(vehicleId, { healthStatus: newHealthStatus });

      // Broadcast to all clients in the vehicle room
      const roomName = `vehicle:${vehicleId}`;
      namespace.to(roomName).emit('code-cleared', {
        vehicleId,
        codeId,
        code: diagnosticCode.toJSON(),
      });
    } catch (error) {
      console.error('[OBD] Error clearing diagnostic code:', error);
      socket.emit('error', { message: 'Failed to clear diagnostic code' });
    }
  });

  // Request current stats
  socket.on('request-stats', async (payload: { vehicleId: string }) => {
    const { vehicleId } = payload;

    try {
      const stats = await VehicleStats.findOne({ vehicleId })
        .sort({ timestamp: -1 })
        .lean();

      socket.emit('stats-response', { vehicleId, stats });
    } catch (error) {
      console.error('[OBD] Error fetching stats:', error);
      socket.emit('error', { message: 'Failed to fetch stats' });
    }
  });

  // Request active codes
  socket.on('request-codes', async (payload: { vehicleId: string }) => {
    const { vehicleId } = payload;

    try {
      const codes = await DiagnosticCode.find({
        vehicleId,
        isActive: true
      }).lean();

      socket.emit('codes-response', { vehicleId, codes });
    } catch (error) {
      console.error('[OBD] Error fetching codes:', error);
      socket.emit('error', { message: 'Failed to fetch codes' });
    }
  });
};

// Helper function to check for alert conditions
function checkForAlerts(stats: Partial<IVehicleStats>): string[] {
  const alerts: string[] = [];

  if (stats.engineTemp !== undefined && stats.engineTemp > 220) {
    alerts.push('Engine temperature is high');
  }

  if (stats.batteryVoltage !== undefined && stats.batteryVoltage < 12.0) {
    alerts.push('Battery voltage is low');
  }

  if (stats.fuelLevel !== undefined && stats.fuelLevel < 10) {
    alerts.push('Fuel level is low');
  }

  if (stats.oilPressure !== undefined && stats.oilPressure < 20) {
    alerts.push('Oil pressure is low');
  }

  if (stats.coolantTemp !== undefined && stats.coolantTemp > 230) {
    alerts.push('Coolant temperature is high');
  }

  return alerts;
}
