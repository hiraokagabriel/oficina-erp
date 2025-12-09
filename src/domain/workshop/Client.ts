export interface ClientVehicle {
  model: string;
  plate?: string;
}

export interface Client {
  readonly id: string;
  readonly name: string;
  readonly phone?: string; // Contato
  readonly notes?: string; // Obs.
  readonly vehicles: ClientVehicle[]; 
  readonly lastVisit: string;
}

export const learnClientData = (
  currentClients: Client[], 
  clientName: string, 
  vehicleModel: string,
  vehiclePlate: string,
  clientPhone: string,
  clientNotes: string
): Client[] => {
  const normalizedName = clientName.trim();
  const normalizedModel = vehicleModel.trim();
  const normalizedPlate = vehiclePlate.trim().toUpperCase();
  const normalizedPhone = clientPhone.trim();
  const normalizedNotes = clientNotes.trim();
  
  if (!normalizedName) return currentClients;

  const existingClientIndex = currentClients.findIndex(
    c => c.name.toLowerCase() === normalizedName.toLowerCase()
  );

  if (existingClientIndex >= 0) {
    const client = currentClients[existingClientIndex];
    
    const hasVehicle = client.vehicles.some(v => {
      if (normalizedPlate && v.plate) return v.plate === normalizedPlate;
      return v.model.toLowerCase() === normalizedModel.toLowerCase();
    });

    const newVehicles = hasVehicle 
      ? client.vehicles 
      : [...client.vehicles, { model: normalizedModel, plate: normalizedPlate }];

    const updatedClient = {
      ...client,
      phone: normalizedPhone || client.phone,
      notes: normalizedNotes || client.notes,
      vehicles: newVehicles,
      lastVisit: new Date().toISOString()
    };

    const newClients = [...currentClients];
    newClients[existingClientIndex] = updatedClient;
    return newClients;

  } else {
    const newClient: Client = {
      id: crypto.randomUUID(),
      name: normalizedName,
      phone: normalizedPhone,
      notes: normalizedNotes,
      vehicles: [{ model: normalizedModel, plate: normalizedPlate }],
      lastVisit: new Date().toISOString()
    };
    return [...currentClients, newClient];
  }
};