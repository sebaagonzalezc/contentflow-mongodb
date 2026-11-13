"""Modelos de entrada (Pydantic): validan campos obligatorios, tipos, largos y
valores permitidos antes de tocar la base de datos. Si algo no cumple, FastAPI
responde 422 sin ejecutar la operacion."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Genero = Literal["Masculino", "Femenino", "Otro"]
Dispositivo = Literal["Móvil", "Desktop", "Tablet"]
Categoria = Literal["Deportes", "Cultura", "Entretenimiento", "Tecnología", "Educación"]
TipoPublicacion = Literal["Texto", "Imagen", "Video"]
TipoReaccion = Literal["Me gusta", "Me encanta", "Me entristece", "Me enoja"]
Hashtag = Annotated[str, Field(pattern=r"^#\w{2,30}$")]


class Base(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class UsuarioIn(Base):
    nombre: str = Field(min_length=2, max_length=100)
    correo: EmailStr
    pais: str = Field(min_length=2, max_length=60)
    genero: Genero
    dispositivo: Dispositivo


class PublicacionIn(Base):
    usuario_id: str = Field(min_length=1)
    contenido: str = Field(min_length=1, max_length=5000)
    categoria: Categoria
    hashtags: list[Hashtag] = Field(default_factory=list, max_length=10)
    tipo: TipoPublicacion


class PublicacionPatch(Base):
    contenido: str | None = Field(default=None, min_length=1, max_length=5000)
    categoria: Categoria | None = None
    agregar_hashtags: list[Hashtag] | None = Field(default=None, max_length=10)


class ComentarioIn(Base):
    usuario_id: str = Field(min_length=1)
    publicacion_id: str = Field(min_length=1)
    comentario: str = Field(min_length=1, max_length=1000)


class ReaccionIn(Base):
    usuario_id: str = Field(min_length=1)
    publicacion_id: str = Field(min_length=1)
    tipo_reaccion: TipoReaccion
