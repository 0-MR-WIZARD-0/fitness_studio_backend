export const PASSWORD_RE =
  /^(?=.*[a-zа-яё])(?=.*[A-ZА-ЯЁ])(?=.*\d)(?=.*[^A-Za-zА-Яа-яЁё0-9\s]).{8,}$/;

export const PASSWORD_RULE =
  'Пароль: 8+ символов, заглавная и строчная буквы, цифра и специальный символ';

export const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

export const USERNAME_RULE =
  'Логин: от 3 до 32 символов, латинские буквы, цифры, точка, дефис или подчёркивание';
