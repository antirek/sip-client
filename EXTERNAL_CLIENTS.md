# Подключение внешних SIP клиентов

## Настройка сервера для внешнего доступа

### 1. Запуск сервера с внешним доступом

```bash
chmod +x start-server-external.sh
./start-server-external.sh
```

### 2. Получение внешнего IP адреса

Сервер покажет ваш внешний IP адрес при запуске, или используйте:

```bash
curl ifconfig.me
# или
wget -qO- ifconfig.me
```

### 3. Настройка файрвола (если необходимо)

```bash
# Ubuntu/Debian
sudo ufw allow 5060/udp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=5060/udp
sudo firewall-cmd --reload
```

## Настройка внешних SIP клиентов

### Zoiper (Windows/Linux/Mac)

1. **Скачайте Zoiper**: https://www.zoiper.com/
2. **Настройки подключения**:
   - **SIP Server**: `YOUR_EXTERNAL_IP:5060`
   - **Username**: любой номер (например, `100`)
   - **Password**: оставьте пустым
   - **Domain**: `YOUR_EXTERNAL_IP`

### MicroSIP (Windows)

1. **Скачайте MicroSIP**: https://www.microsip.org/
2. **Настройки**:
   - **SIP Server**: `YOUR_EXTERNAL_IP`
   - **Port**: `5060`
   - **Username**: любой номер
   - **Password**: пустое поле

### X-Lite (Windows/Mac)

1. **Скачайте X-Lite**: https://www.counterpath.com/x-lite/
2. **Настройки**:
   - **SIP Server**: `YOUR_EXTERNAL_IP:5060`
   - **Username**: любой номер
   - **Password**: не требуется

### Android SIP клиенты

#### Zoiper для Android

1. **Установите из Google Play**
2. **Настройки**:
   - **SIP Server**: `YOUR_EXTERNAL_IP:5060`
   - **Username**: любой номер
   - **Password**: оставьте пустым

#### CSipSimple

1. **Установите из Google Play**
2. **Настройки**:
   - **SIP Server**: `YOUR_EXTERNAL_IP`
   - **Port**: `5060`
   - **Username**: любой номер

### iOS SIP клиенты

#### Zoiper для iOS

1. **Установите из App Store**
2. **Настройки**:
   - **SIP Server**: `YOUR_EXTERNAL_IP:5060`
   - **Username**: любой номер
   - **Password**: не требуется

## Тестирование подключения

### 1. Регистрация

После настройки клиент должен успешно зарегистрироваться. В логах сервера вы увидите:

```
✓ Registered 100 -> <sip:100@CLIENT_IP:PORT>
```

### 2. Проверка регистраций

В консоли сервера введите:

```
list-registrations
```

### 3. Тестовый звонок

С сервера можно сделать тестовый звонок:

```
make-call 101 100
```

### 4. Звонки между клиентами

Клиенты могут звонить друг другу, набирая номер абонента.

## Примеры конфигурации

### Пример 1: Zoiper

```
Account Name: My SIP Account
SIP Server: 203.0.113.1:5060
Username: 100
Password: (пустое поле)
Domain: 203.0.113.1
```

### Пример 2: MicroSIP

```
Display Name: Test User
SIP Server: 203.0.113.1
Port: 5060
Username: 101
Password: (пустое поле)
```

### Пример 3: Android Zoiper

```
Account Name: External SIP
SIP Server: 203.0.113.1:5060
Username: 102
Password: (пустое поле)
Domain: 203.0.113.1
```

## Устранение неполадок

### Проблема: Клиент не может подключиться

1. **Проверьте файрвол**:
   ```bash
   sudo ufw status
   ```

2. **Проверьте порт**:
   ```bash
   netstat -tulpn | grep 5060
   ```

3. **Проверьте внешний IP**:
   ```bash
   curl ifconfig.me
   ```

### Проблема: Регистрация не проходит

1. **Проверьте логи сервера**
2. **Убедитесь, что IP адрес правильный**
3. **Проверьте настройки клиента**

### Проблема: Звонки не проходят

1. **Проверьте, что оба клиента зарегистрированы**
2. **Проверьте логи сервера**
3. **Убедитесь, что RTP порты открыты (если необходимо)**

## Безопасность

⚠️ **Важно**: Этот сервер не имеет аутентификации и предназначен только для тестирования!

Для продакшена рекомендуется:
- Добавить аутентификацию
- Использовать TLS/SRTP
- Настроить файрвол
- Ограничить доступ по IP 