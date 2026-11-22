# Datos académicos de la FCQ-UNA

Planes de estudio, prerrequisitos, optativas, reglas de firma y calendario de la
Facultad de Ciencias Químicas (UNA), sacados de las resoluciones oficiales que la
facultad publica en <https://www.qui.una.py>. Todos los PDFs de mallas están
escaneados: se leyeron página por página y en cada plan se comprobó que los
créditos de cada nivel sumen lo que dice la resolución.

## Cómo cargarlo en Supabase

1. Aplicar antes las migraciones de `supabase/migrations/`.
2. Regenerar el SQL si se tocó algún JSON: `python3 supabase/datos-fcq/generar_seed.py`.
3. Ejecutar `supabase/seed_fcq.sql` en el SQL Editor del proyecto de la app.

El seed usa ids fijos (UUID v5 a partir de carrera, plan y materia), así que se
puede volver a ejecutar para corregir datos sin duplicar filas.

## Cómo está modelado

| JSON | Tabla | Notas |
|---|---|---|
| `nivel` | `materias.semestre` | Nivel 1 a 11. Los niveles impares se dictan en el 1.er semestre y los pares en el 2.º. |
| `T + RP + P` | `materias.horas` | Horas semanales × 15 semanas, más las horas semestrales extra de pasantías y prácticas. |
| `P > 0` | `materias.tiene_laboratorio` | |
| `creditos` | `materias.creditos` | Créditos académicos CONES (1 crédito = 25 h). |
| `prerrequisitos` | `prerrequisitos` (tipo `aprobada`) | El reglamento exige materias **aprobadas** (Art. 7 y 8). `*nivel N` significa "todo lo obligatorio aprobado hasta el nivel N" y se expande a una fila por materia. |
| `optativas.grupos` | `grupos_optativas` | `cantidad_exigida` = optativas que hay que aprobar. Las optativas se cargan en el primer nivel donde el plan tiene un hueco de optativa. |
| reglamento | `reglas_firma` | Una regla general por plan (ver abajo). |

## Planes cargados

| Carrera | Plan | Resolución CSU | Niveles | Créditos obligatorios | Optativas |
|---|---|---|---|---|---|
| Farmacia | 2026 | [0877-00-2025](https://www.qui.una.py/v3/wp-content/uploads/2026/07/FARMACIA_26_Resolucion-N°-0877-QF.pdf) | 11 | 331 | 4 (niveles 3, 5, 6, 10) |
| Bioquímica | 2026 | [0875-00-2025](https://www.qui.una.py/v3/wp-content/uploads/2026/10/1°_Resolucion-N°-0875-B-FCQ-2.pdf) | 11 | 311 | 3 (niveles 3, 6, 10) |
| Ingeniería Química | 2026 | [0873-00-2025](https://www.qui.una.py/v3/wp-content/uploads/2026/07/ING_QCA_Resolucion-N°-0873-IQ.pdf) | 11 | 338 | idioma (nivel 4) + 2 (niveles 5, 8) |
| Química Industrial | 2026 | [0876-00-2025](https://www.qui.una.py/v3/wp-content/uploads/2026/07/QCA_IND_Resolucion-N°-0876-QI.pdf) | 9 | 262 | 3 (niveles 4, 7, 8) |
| Ciencia y Tecnología de Alimentos | 2026 | [0872-00-2025](https://www.qui.una.py/v3/wp-content/uploads/2026/07/CTA_Resolucion-N°-0872.pdf) | 9 | 267 | 3 (niveles 4, 7, 8) |
| Nutrición | 2026 | [0879-00-2025](https://www.qui.una.py/v3/wp-content/uploads/2026/07/NUTRI_Resolucion-N°-0879-N.pdf) | 10 | 303 | 4 (niveles 2, 4, 5, 7) |
| Ingeniería de Alimentos | 2026 | [0874-00-2025](https://www.qui.una.py/v3/wp-content/uploads/2026/07/IA_Resolucion-N°-0874-IA.pdf) | 11 | 337 | 3 (niveles 5, 6, 8) |

Los planes 2018 (con su modificación de 2024) y 2008 están en curso; ver
"Pendiente" abajo.

## Reglas de firma y calificación

Fuente: Reglamento del Régimen Académico de las Carreras de Grado de la FCQ,
[Res. CSU 0108-00-2024](https://www.qui.una.py/v3/wp-content/uploads/2024/06/Resol-108_00_2024-ACTUALIZA_Reglamento-regimen-academico-2.pdf), vigente desde el 14/02/2024.

- **Habilitación a final (Art. 43):** parciales prácticos ≥ 60 %; parciales teóricos ≥ 50 % (o ≥ 60 % en el examen de recuperación); asistencia ≥ 60 % a teoría y 100 % de las prácticas cumplidas y aprobadas; requisitos de la cátedra; estar al día con aranceles.
- **Promedio General (Art. 44):** PG = (promedio teórico + promedio práctico) / 2, salvo excepciones aprobadas por el Consejo Directivo para una asignatura.
- **Recuperación (Art. 46):** solo en el 1.er periodo de finales; para quien tiene teórico entre 30 % y 49 % y cumplió asistencia y prácticas. Con ≥ 60 % reemplaza el parcial teórico más bajo; después necesita PG ≥ 50 %.
- **Regularización (Art. 40, 41):** se puede faltar a un parcial teórico sin justificar y rendirlo en el 1.er o 2.º periodo de finales; con dos ausencias ya no.
- **Vigencia de la firma (Art. 49, 50, 62):** 2 periodos académicos consecutivos en que se oferte la materia. Tras 3 aplazos o 2 periodos sin aprobar, se recursa.
- **Calificación final (Art. 57, 58):** CF = 0,40 × PG + 0,60 × EF, con EF ≥ 60 %. Escala: 0–59 % = 1; 60–70 % = 2; 71–80 % = 3; 81–90 % = 4; 91–100 % = 5. Fracción ≥ 0,5 redondea hacia arriba.
- **Inscripción (Art. 7–9):** sin los prerrequisitos aprobados no se puede inscribir; máximo 7 asignaturas por semestre (sin contar optativas, seminarios, pasantías, semestre opuesto ni materias con firma ya obtenida).

## Calendario 2026

En `calendario-2026.json`: clases del 23/02 al 06/06 y del 03/08 al 14/11,
tres periodos de finales por semestre, matriculaciones, vencimientos de aranceles
y plazos de solicitudes. Fuente: [Calendario de Actividades 2026](https://www.qui.una.py/v3/academico/calendario-academico-fcq/).

## Lo que no se pudo confirmar

Cada JSON tiene una lista `dudas`. Las principales:

- **Farmacia 2026:** en Fisicoquímica Farmacéutica y Química Analítica III el escaneo muestra "Química Orgánica I" partido en dos líneas; podría ser "Química Orgánica II".
- **Bioquímica 2026:** Bioquímica Nutricional pide Toxicología en la Tabla 2.1 y Bromatología/Toxicología en la Tabla 1 del mismo documento. Se tomó la Tabla 2.1.
- **Nutrición 2026:** el nombre de la optativa "Sistema de Intercambio" está cortado en la tabla.
- **Ing. de Alimentos 2026:** tres optativas del 2.º semestre se tomaron de la Tabla 1, con reparto de horas asumido 3-0-0.
- **Calendario:** el 3.er periodo de finales del 2.º semestre figura como enero/febrero de 2026 en la web; por el orden debería ser 2027.
- No se cargaron reglas de firma por materia: el reglamento permite que una cátedra tenga otro cálculo del PG (Art. 44), pero esas excepciones no están publicadas.
- Los códigos de asignatura no figuran en las resoluciones; `materias.codigo` queda vacío.

## Pendiente

- Plan 2018 de las 7 carreras, en su versión modificada de 2024 (es el que cursa la mayoría).
- Plan 2008 (adecuación 2010) y la tabla oficial de homologación 2008 → 2018.
