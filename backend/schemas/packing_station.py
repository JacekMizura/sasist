from pydantic import BaseModel, Field


class SetPackingStationBody(BaseModel):
    packing_station_id: int = Field(..., ge=1)
