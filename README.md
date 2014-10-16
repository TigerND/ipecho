
### IPEcho

Simple IP Echo Server

### Examples

```sh
curl -H "Accept: text/x-yaml" http://ipecho.plexrayinc.com/
```

```js
$.ajax({
    url: "http://ipecho.plexrayinc.com/",
    headers: {"Accept": "application/json"}
}).done(function(data) {
    console.log("Received:", data)
})
```

### Currently supported types:
* text/plain
* application/json
* text/yaml
* text/x-yaml
* application/yaml
* application/x-yaml
* text/html
