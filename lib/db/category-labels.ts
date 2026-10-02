// De-para manual: slug EN (dados) -> nome PT original -> rótulo amigável PT-BR.
//
// - `slug`: valor real em products.product_category_name (igual a
//   PRODUCT_CATEGORIES em lib/db/categories.ts, gerado pelo ETL).
// - `pt`: nome original PT do Kaggle (products.product_category_name_pt).
// - `label`: rótulo user-friendly exibido na UI e entendido pela
//   resolveCategory (lib/mcp/server.ts) — o agente traduz nome amigável->slug.
//
// Se o ETL gerar um slug novo, tests/category-labels.test.ts falha
// pedindo a entrada correspondente aqui.
export type CategoryEntry = { slug: string; pt: string; label: string };

export const CATEGORY_ENTRIES: CategoryEntry[] = [
  { slug: "agro_industry_and_commerce", pt: "agro_industria_e_comercio", label: "Agroindústria e Comércio" },
  { slug: "air_conditioning", pt: "climatizacao", label: "Climatização" },
  { slug: "art", pt: "artes", label: "Arte" },
  { slug: "arts_and_craftmanship", pt: "artes_e_artesanato", label: "Artes e Artesanato" },
  { slug: "audio", pt: "audio", label: "Áudio" },
  { slug: "auto", pt: "automotivo", label: "Automotivo" },
  { slug: "baby", pt: "bebes", label: "Bebês" },
  { slug: "bed_bath_table", pt: "cama_mesa_banho", label: "Cama, Mesa e Banho" },
  { slug: "books_general_interest", pt: "livros_interesse_geral", label: "Livros de Interesse Geral" },
  { slug: "books_imported", pt: "livros_importados", label: "Livros Importados" },
  { slug: "books_technical", pt: "livros_tecnicos", label: "Livros Técnicos" },
  { slug: "cds_dvds_musicals", pt: "cds_dvds_musicais", label: "CDs e DVDs Musicais" },
  { slug: "christmas_supplies", pt: "artigos_de_natal", label: "Artigos de Natal" },
  { slug: "cine_photo", pt: "cine_foto", label: "Cine e Foto" },
  { slug: "computers", pt: "pcs", label: "Computadores" },
  { slug: "computers_accessories", pt: "informatica_acessorios", label: "Acessórios de Informática" },
  { slug: "consoles_games", pt: "consoles_games", label: "Consoles e Games" },
  { slug: "construction_tools_construction", pt: "construcao_ferramentas_construcao", label: "Ferramentas de Construção" },
  { slug: "construction_tools_lights", pt: "construcao_ferramentas_iluminacao", label: "Iluminação para Construção" },
  { slug: "construction_tools_safety", pt: "construcao_ferramentas_seguranca", label: "Segurança para Construção" },
  { slug: "cool_stuff", pt: "cool_stuff", label: "Cool Stuff" },
  { slug: "costruction_tools_garden", pt: "construcao_ferramentas_jardim", label: "Jardinagem" },
  { slug: "costruction_tools_tools", pt: "construcao_ferramentas_ferramentas", label: "Ferramentas" },
  { slug: "diapers_and_hygiene", pt: "fraldas_higiene", label: "Fraldas e Higiene" },
  { slug: "drinks", pt: "bebidas", label: "Bebidas" },
  { slug: "dvds_blu_ray", pt: "dvds_blu_ray", label: "DVDs e Blu-ray" },
  { slug: "electronics", pt: "eletronicos", label: "Eletrônicos" },
  { slug: "fashio_female_clothing", pt: "fashion_roupa_feminina", label: "Moda Feminina" },
  { slug: "fashion_bags_accessories", pt: "fashion_bolsas_e_acessorios", label: "Bolsas e Acessórios" },
  { slug: "fashion_childrens_clothes", pt: "fashion_roupa_infanto_juvenil", label: "Moda Infantojuvenil" },
  { slug: "fashion_male_clothing", pt: "fashion_roupa_masculina", label: "Moda Masculina" },
  { slug: "fashion_shoes", pt: "fashion_calcados", label: "Calçados" },
  { slug: "fashion_sport", pt: "fashion_esporte", label: "Moda Esporte" },
  { slug: "fashion_underwear_beach", pt: "fashion_underwear_e_moda_praia", label: "Moda Praia e Íntima" },
  { slug: "fixed_telephony", pt: "telefonia_fixa", label: "Telefonia Fixa" },
  { slug: "flowers", pt: "flores", label: "Flores" },
  { slug: "food", pt: "alimentos", label: "Alimentos" },
  { slug: "food_drink", pt: "alimentos_bebidas", label: "Alimentos e Bebidas" },
  { slug: "furniture_bedroom", pt: "moveis_quarto", label: "Móveis para Quarto" },
  { slug: "furniture_decor", pt: "moveis_decoracao", label: "Decoração" },
  { slug: "furniture_living_room", pt: "moveis_sala", label: "Móveis para Sala" },
  { slug: "furniture_mattress_and_upholstery", pt: "moveis_colchao_e_estofado", label: "Colchões e Estofados" },
  { slug: "garden_tools", pt: "ferramentas_jardim", label: "Ferramentas de Jardim" },
  { slug: "health_beauty", pt: "beleza_saude", label: "Beleza e Saúde" },
  { slug: "home_appliances", pt: "eletrodomesticos", label: "Eletrodomésticos" },
  { slug: "home_appliances_2", pt: "eletrodomesticos_2", label: "Eletrodomésticos (linha 2)" },
  { slug: "home_comfort_2", pt: "casa_conforto_2", label: "Conforto para Casa (linha 2)" },
  { slug: "home_confort", pt: "casa_conforto", label: "Conforto para Casa" },
  { slug: "home_construction", pt: "casa_construcao", label: "Casa e Construção" },
  { slug: "housewares", pt: "utilidades_domesticas", label: "Utilidades Domésticas" },
  { slug: "industry_commerce_and_business", pt: "industria_comercio_e_negocios", label: "Indústria e Comércio" },
  { slug: "kitchen_dining_laundry_garden_furniture", pt: "moveis_cozinha_area_de_servico_jantar_e_jardim", label: "Móveis p/ Cozinha, Jantar e Jardim" },
  { slug: "la_cuisine", pt: "la_cuisine", label: "La Cuisine" },
  { slug: "luggage_accessories", pt: "malas_acessorios", label: "Malas e Acessórios" },
  { slug: "market_place", pt: "market_place", label: "Marketplace" },
  { slug: "music", pt: "musica", label: "Música" },
  { slug: "musical_instruments", pt: "instrumentos_musicais", label: "Instrumentos Musicais" },
  { slug: "office_furniture", pt: "moveis_escritorio", label: "Móveis de Escritório" },
  { slug: "party_supplies", pt: "artigos_de_festas", label: "Artigos de Festa" },
  { slug: "pc_gamer", pt: "pc_gamer", label: "PC Gamer" },
  { slug: "perfumery", pt: "perfumaria", label: "Perfumaria" },
  { slug: "pet_shop", pt: "pet_shop", label: "Pet Shop" },
  { slug: "portateis_cozinha_e_preparadores_de_alimentos", pt: "portateis_cozinha_e_preparadores_de_alimentos", label: "Portáteis de Cozinha" },
  { slug: "security_and_services", pt: "seguros_e_servicos", label: "Seguros e Serviços" },
  { slug: "signaling_and_security", pt: "sinalizacao_e_seguranca", label: "Sinalização e Segurança" },
  { slug: "small_appliances", pt: "eletroportateis", label: "Eletroportáteis" },
  { slug: "small_appliances_home_oven_and_coffee", pt: "portateis_casa_forno_e_cafe", label: "Fornos e Cafeteiras" },
  { slug: "sports_leisure", pt: "esporte_lazer", label: "Esporte e Lazer" },
  { slug: "stationery", pt: "papelaria", label: "Papelaria" },
  { slug: "tablets_printing_image", pt: "tablets_impressao_imagem", label: "Tablets e Impressão" },
  { slug: "telephony", pt: "telefonia", label: "Telefonia" },
  { slug: "toys", pt: "brinquedos", label: "Brinquedos" },
  { slug: "watches_gifts", pt: "relogios_presentes", label: "Relógios e Presentes" },
];

/** slug EN -> rótulo amigável (p/ exibir na UI e nas sugestões de typo). */
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_ENTRIES.map((e) => [e.slug, e.label]),
);
