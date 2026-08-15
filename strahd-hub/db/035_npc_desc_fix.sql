update npcs set description = null
where description is not null and trim(description) = '';