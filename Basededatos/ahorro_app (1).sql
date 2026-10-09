SET SESSION sql_require_primary_key = 0;
-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 08-09-2026 a las 21:32:26
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
(1, 2, NULL, 'Transporte', 1232.00, '2026-06-07'),
(2, 2, NULL, 'Ropa / accesorios', 21312.00, '2026-06-06'),
(3, 5, NULL, 'Transporte', 200.00, '2026-06-04'),
(4, 5, NULL, 'Salud / medicina', 4000.00, '2026-06-02'),
(5, 6, NULL, 'Necesario', 4000.00, '2026-06-03'),
(7, 6, NULL, 'Ropa / accesorios', 1000.00, '2026-06-05'),
(8, 6, NULL, 'Familia', 1100.00, '2026-06-05'),
(9, 6, NULL, 'Transporte', 1200.00, '2026-04-17'),
(10, 6, NULL, 'escuela', 1200.00, '2026-05-15'),
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
(21, 4, NULL, 'Transporte', 50.00, '2026-07-16'),
(22, 4, NULL, 'Servicios / luz / agua', 600.00, '2026-07-16');

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
  `reset_expiracion` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `usuarios`
--

INSERT INTO `usuarios` (`id`, `nombre`, `correo`, `password`, `saldo`, `fecha_registro`, `reset_token`, `reset_expiracion`) VALUES
(1, 'hola', 'hola@gmail.com', '$2b$10$VkMqhUD7o03fL8PA/QmL4OxddDJKqmxMK9kJBV5P.bMmsxOlvnfP6', 2332.00, '2026-06-07 20:32:53', NULL, NULL),
(2, 'Sergio', 'hola123@gmail.com', '$2b$10$hcLW1eQhFz2THNhErOHwC.yKlYVQ7FGCjyj4ui3AScJVV1Zft3QSO', 23333.00, '2026-06-07 20:46:28', NULL, NULL),
(3, 'Sergio', 'SergioTorres0812@outlook.com', '$2b$10$1CZWBmd/oaxGdJ8KpFBpDunIIcAOhaWsH3wi8VW2dXtByeZVvgmSS', 10000.00, '2026-06-07 20:56:03', '01fd7350294a1758f71b0a91b30098eed190977d', '2026-06-07 16:35:02'),
(4, 'Sergio', 'www.sergiotomastorresavila@gmail.com', '$2b$10$t27pvr8xik5I8Cvw0xx9q.opQiwKNiyOoSahuNq0wHB3YnrsQTkpa', 30000.00, '2026-06-07 21:23:33', '586ad0c8ca03d018c0e71849e1317558abc5a306', '2026-07-15 21:30:54'),
(5, 'Marian', 'marianaldaraca@gmail.com', '$2b$10$451xP1jfI7I2qLIXf4DB/eNC7TWWUaogVQbgF3/EKTJQB.v4Lusni', 20000.00, '2026-06-08 19:51:20', '17e5fd2bac6be72cdd92af422d8f803e767f10e4', '2026-06-08 14:53:11'),
(6, 'mkjkj', '', '$2b$10$u6PbXRv3rFOjmMMxRlBd/OSG.jpEJypwpkzbBM54ckgAYQKsoLqP6', 0.00, '2026-06-09 01:07:33', '5e44d05fa4787c57ac3a98b7ac062126cb33c231', '2026-06-10 23:20:57'),
(7, 'Usuario Consiente', 'hannieh2000@gmail.com', '$2b$10$Y/8EMTwyu5z4dg3FnFa5zuVDnmazQrtB92BUn6D9rg9tmY9ulYAK2', 25000.00, '2026-06-17 01:04:36', 'ad45a1d47130de05c513a335dfcd3fa947d2550c', '2026-07-08 21:30:18'),
(8, 'Sergio Torres', '1234@gmail.com', '$2b$10$eVLtTepAwJe.s.hjRJQQbeuMxoPnBIqUz36pvI/ixHxDQ0vc0u.Nq', 23333.00, '2026-07-16 01:38:57', NULL, NULL);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `movimientos`
--
ALTER TABLE `movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`);

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
-- AUTO_INCREMENT de la tabla `movimientos`
--
ALTER TABLE `movimientos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `movimientos`
--
ALTER TABLE `movimientos`
  ADD CONSTRAINT `fk_movimientos_usuarios` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
