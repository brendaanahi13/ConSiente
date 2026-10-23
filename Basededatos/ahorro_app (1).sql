SET SESSION sql_require_primary_key = 0;
-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 23-10-2026 a las 01:28:03
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `ahorro_app`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `metas`
--

CREATE TABLE `metas` (
  `id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `monto_target` decimal(10,2) NOT NULL,
  `monto_ahorrado` decimal(10,2) DEFAULT 0.00,
  `fecha_limite` date NOT NULL,
  `frecuencia` varchar(50) DEFAULT 'Semanal',
  `dia_pago` varchar(100) DEFAULT 'Viernes',
  `cuota` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `metas`
--

INSERT INTO `metas` (`id`, `usuario_id`, `nombre`, `monto_target`, `monto_ahorrado`, `fecha_limite`, `frecuencia`, `dia_pago`, `cuota`, `created_at`) VALUES
(19, 7, 'fiesta', 5000.00, 0.00, '2026-12-22', 'Semanal', 'Jueves', 555.56, '2026-10-22 18:55:55'),
(23, 7, 'laptop', 20000.00, 0.00, '2027-02-26', 'Diario', 'Viernes', 157.48, '2026-10-22 21:01:00'),
(24, 7, 'Emergencia', 5000.00, 0.00, '2027-01-09', 'Semanal', 'Viernes', 416.67, '2026-10-22 22:59:43');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `movimientos`
--

CREATE TABLE `movimientos` (
  `id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `tipo` varchar(50) DEFAULT NULL,
  `categoria` varchar(100) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `fecha` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `movimientos`
--

INSERT INTO `movimientos` (`id`, `usuario_id`, `tipo`, `categoria`, `monto`, `fecha`) VALUES
(3, 5, NULL, 'Transporte', 200.00, '2026-06-04'),
(4, 5, NULL, 'Salud / medicina', 4000.00, '2026-06-02'),
(11, 7, NULL, 'Antojos / comida rápida', 500.00, '2026-06-18'),
(12, 7, NULL, 'Salidas / ocio', 350.00, '2026-06-20'),
(13, 7, NULL, 'Educación', 1600.00, '2026-06-14'),
(14, 7, NULL, 'Ropa / accesorios', 800.00, '2026-06-19'),
(15, 7, NULL, 'Transporte', 200.00, '2026-07-02'),
(16, 4, NULL, 'Gasto de Gasolina', 300.00, '2026-07-16'),
(17, 4, NULL, 'Servicios / luz / agua', 500.00, '2026-07-15'),
(18, 4, NULL, 'Salidas / ocio', 300.00, '2026-07-16'),
(19, 4, NULL, 'Educación', 2000.00, '2026-07-16'),
(20, 4, NULL, 'Antojos / comida rápida', 150.00, '2026-07-16'),
(25, 7, NULL, 'Salidas / ocio', 100.00, '2026-10-05'),
(50, 7, NULL, 'Necesario', 200.00, '2025-10-22'),
(51, 7, NULL, 'Antojos / comida rápida', 4000.00, '2025-10-24'),
(71, 7, NULL, 'Transporte', 10.00, '2026-10-17');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `suscripciones_push`
--

CREATE TABLE `suscripciones_push` (
  `user_id` int(11) NOT NULL,
  `subscription_data` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `suscripciones_push`
--

INSERT INTO `suscripciones_push` (`user_id`, `subscription_data`, `created_at`) VALUES
(1, '{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/dktU9Ovfd9w:APA91bHwg6TvNwdJevvdTScUQxHKpKvlYrj_VzaJZjModVCupMaUmIkTQ6rqdDgIik-caWh7F72x7NCpo5hl1bXMj4gTrekzjQeJ6APJEqAIaq5TH71QdHTiX3i1TZQpLmbCu9kAchXo\",\"expirationTime\":null,\"keys\":{\"p256dh\":\"BOD_-0kJuK2rlYiLnp-tYqHW3f-ozmXk5kQ2db8S6hBIqCxMaBgBIXhFrXlaFXsH7Rg-cqp3AYYxpo_sd0v9Lss\",\"auth\":\"GC0WzOiU1tMmPVPagMMbIw\"}}', '2026-10-22 18:32:55');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `correo` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `saldo` decimal(10,2) DEFAULT 0.00,
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp(),
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_expiracion` datetime DEFAULT NULL,
  `rol` varchar(50) DEFAULT 'usuario',
  `racha_dias` int(11) DEFAULT 0,
  `ultimo_acceso` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `usuarios`
--

INSERT INTO `usuarios` (`id`, `nombre`, `correo`, `password`, `saldo`, `fecha_registro`, `reset_token`, `reset_expiracion`, `rol`, `racha_dias`, `ultimo_acceso`) VALUES
(1, 'hola', 'hola@gmail.com', '$2b$10$VkMqhUD7o03fL8PA/QmL4OxddDJKqmxMK9kJBV5P.bMmsxOlvnfP6', 2332.00, '2026-06-07 20:32:53', NULL, NULL, 'usuario', 1, '2026-10-22'),
(4, 'Sergio', 'www.sergiotomastorresavila@gmail.com', '$2b$10$t27pvr8xik5I8Cvw0xx9q.opQiwKNiyOoSahuNq0wHB3YnrsQTkpa', 30000.00, '2026-06-07 21:23:33', '586ad0c8ca03d018c0e71849e1317558abc5a306', '2026-07-15 21:30:54', 'usuario', 0, NULL),
(5, 'Marian', 'marianaldaraca@gmail.com', '$2b$10$451xP1jfI7I2qLIXf4DB/eNC7TWWUaogVQbgF3/EKTJQB.v4Lusni', 20000.00, '2026-06-08 19:51:20', '17e5fd2bac6be72cdd92af422d8f803e767f10e4', '2026-06-08 14:53:11', 'usuario', 0, NULL),
(7, 'Marian', 'hannieh2000@gmail.com', '$2b$10$Y/8EMTwyu5z4dg3FnFa5zuVDnmazQrtB92BUn6D9rg9tmY9ulYAK2', 19000.00, '2026-06-17 01:04:36', 'ad45a1d47130de05c513a335dfcd3fa947d2550c', '2026-07-08 21:30:18', 'usuario', 1, '2026-10-22'),
(8, 'Sergio Torres', '1234@gmail.com', '$2b$10$eVLtTepAwJe.s.hjRJQQbeuMxoPnBIqUz36pvI/ixHxDQ0vc0u.Nq', 23333.00, '2026-07-16 01:38:57', NULL, NULL, 'usuario', 0, NULL),
(16, 'ConSiente', 'equipoconsiente@gmail.com', '$2b$10$OGFYvxJmmSCp8V1gNgY4fuFigcr1zIl4rqzFLXKdfEWq0EN3eKYW.', 10000.00, '2026-10-21 18:53:00', NULL, NULL, 'admin', 1, '2026-10-22'),
(17, 'Marian Guadalupe', 'marian@gmail.com', '$2b$10$jlEvZgDJD.5C8rHdNhXf5Opt92PjqogubW1lVtvaH9Thg./XRVKOO', 2000.00, '2026-10-22 00:38:43', NULL, NULL, 'usuario', 0, NULL),
(18, 'Marian', 'marian05@gmail.com', '$2b$10$k..u9p6fmzxnJR35MPX9XeTWziUEULXVbd8YXYee1S4GL.NxumiOS', 0.00, '2026-10-22 23:27:04', NULL, NULL, 'admin', 0, NULL);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `metas`
--
ALTER TABLE `metas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `movimientos`
--
ALTER TABLE `movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `suscripciones_push`
--
ALTER TABLE `suscripciones_push`
  ADD PRIMARY KEY (`user_id`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `correo` (`correo`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `metas`
--
ALTER TABLE `metas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;

--
-- AUTO_INCREMENT de la tabla `movimientos`
--
ALTER TABLE `movimientos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=94;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `metas`
--
ALTER TABLE `metas`
  ADD CONSTRAINT `metas_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `movimientos`
--
ALTER TABLE `movimientos`
  ADD CONSTRAINT `fk_movimientos_usuarios` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
